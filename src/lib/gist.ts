import { CacheGist, CachedData } from './types';
import {
  GIST_CACHE_VERSION,
  GIST_DESCRIPTION_PREFIX,
  GIST_FILENAME,
} from './constants';
import { ghGistRaw, ghRest, ghRestOk } from './ghRest';
import { decodeCache, encodeCache } from './cacheCodec';

// Requests go through the same-origin proxy (via the ghRest gateway), which
// injects the GitHub token and the standard Accept / API-version headers
// server-side.
const GISTS_PER_PAGE = 100;
const GIST_FETCH_CONCURRENCY = 5;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

type GitHubGistSummary = {
  id: string;
  description: string | null;
  public: boolean;
  updated_at: string;
  owner?: { login?: string | null } | null;
  files?: Record<string, { filename?: string | null }>;
};

type GitHubGistDetail = GitHubGistSummary & {
  files?: Record<
    string,
    {
      filename?: string | null;
      content?: string | null;
      /** Set when `content` was cut at GitHub's 1 MB inline limit. */
      truncated?: boolean;
      raw_url?: string | null;
    }
  >;
};

export type CacheDiscoveryResult = {
  canonicalGist: CacheGist | null;
  /**
   * The account's current login as GitHub reports it (lowercased): the GraphQL
   * viewer login when known, else the owner of the gists `/gists` listed
   * (only ever the signed-in account's own), else the login passed in. Differs
   * from the session login after a GitHub rename until the session refreshes.
   */
  resolvedOwnerLogin: string;
  duplicateGists: CacheGist[];
  /**
   * False when the remembered gist was validated directly and the full gist
   * listing was skipped — `duplicateGists` is then unknown, not empty.
   */
  scannedAll: boolean;
};

type WriteCacheOptions = {
  discoverCanonicalFallback?: boolean;
};

const normalizeOwnerLogin = (ownerLogin: string) => ownerLogin.toLowerCase();

/**
 * Serializes the cache as pure-ASCII JSON. GitHub account names can contain
 * bidirectional or invisible Unicode (RTL marks, zero-width chars), which makes
 * GitHub flag the gist with a "hidden or bidirectional Unicode text" banner.
 * Escaping every non-ASCII code point to its `\uXXXX` form keeps the stored
 * file ASCII-only (so the banner never appears) while round-tripping losslessly
 * through `JSON.parse` on read. Stays compact — only the rare non-ASCII
 * character in a display name grows, not the ASCII-only logins/ids/urls.
 */
export const serializeCache = (data: unknown): string =>
  JSON.stringify(data).replace(/[\u007F-\uFFFF]/g, (char) => {
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
  });

export const buildCacheKey = (ownerLogin: string) =>
  `follow-sync:${normalizeOwnerLogin(ownerLogin)}:network-cache`;

export const buildCacheDescription = (ownerLogin: string) => {
  const normalizedOwnerLogin = normalizeOwnerLogin(ownerLogin);
  return `${GIST_DESCRIPTION_PREFIX} | owner:${normalizedOwnerLogin} | key:${buildCacheKey(normalizedOwnerLogin)}`;
};

const isCacheDescription = (description?: string | null) =>
  Boolean(description?.startsWith(GIST_DESCRIPTION_PREFIX));

const hasCacheFilename = (gist: Pick<CacheGist, 'files'>) =>
  gist.files.some((file) => file.name === GIST_FILENAME);

const toCacheGist = (gist: GitHubGistDetail): CacheGist => ({
  id: gist.id,
  name: gist.id,
  ownerLogin: gist.owner?.login ?? null,
  description: gist.description,
  updatedAt: gist.updated_at,
  files: Object.values(gist.files ?? {}).map((file) => ({
    name: file.filename ?? '',
    text: file.content ?? null,
    truncated: Boolean(file.truncated),
    rawUrl: file.raw_url ?? null,
  })),
});

const fetchGistById = async (gistId: string) => {
  const gist = await ghRest<GitHubGistDetail>(`/gists/${gistId}`);
  if (!gist) return null;

  const cacheGist = toCacheGist(gist);

  // Files over 1 MB come back truncated; load the full cache from raw_url so
  // large networks don't fail to parse and trigger a full sync on every load.
  const cacheFile = cacheGist.files.find((file) => file.name === GIST_FILENAME);
  if (cacheFile?.truncated && cacheFile.rawUrl) {
    cacheFile.text = await ghGistRaw(cacheFile.rawUrl);
    cacheFile.truncated = false;
  }

  return cacheGist;
};

const listAllGists = async () => {
  const gists: GitHubGistSummary[] = [];

  for (let page = 1; ; page++) {
    const pageItems = await ghRest<GitHubGistSummary[]>(
      `/gists?per_page=${GISTS_PER_PAGE}&page=${page}`
    );

    if (!pageItems?.length) {
      break;
    }

    gists.push(...pageItems);

    if (pageItems.length < GISTS_PER_PAGE) {
      break;
    }
  }

  return gists;
};

const isPotentialCacheGistSummary = (gist: GitHubGistSummary) => {
  if (gist.public) {
    return false;
  }

  const filenames = Object.values(gist.files ?? {}).map(
    (file) => file.filename
  );
  return (
    isCacheDescription(gist.description) || filenames.includes(GIST_FILENAME)
  );
};

const mapWithConcurrency = async <TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>
) => {
  const results: TOutput[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const currentBatch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(currentBatch.map(mapper));
    results.push(...batchResults);
  }

  return results;
};

const getExpectedCacheKey = (ownerLogin: string) =>
  buildCacheKey(normalizeOwnerLogin(ownerLogin));

/**
 * Whether a candidate may be used as this account's cache at all. Secret gists
 * are readable by anyone who knows the id, so a gist id remembered from a
 * previous account on this browser would otherwise load (and relabel) someone
 * else's network.
 *
 * The gist owner GitHub reports is authoritative: a cache whose recorded
 * `metadata.ownerLogin` is an older login of the same account (the user renamed
 * their GitHub account) is still theirs, and is relabelled on the next write.
 * The recorded owner is only consulted when GitHub didn't return an owner.
 */
export const isCacheGistOwnedBy = (gist: CacheGist, ownerLogin: string) => {
  const normalizedOwnerLogin = normalizeOwnerLogin(ownerLogin);

  if (gist.ownerLogin) {
    return normalizeOwnerLogin(gist.ownerLogin) === normalizedOwnerLogin;
  }

  const parsedOwnerLogin = parseCache(gist)?.metadata?.ownerLogin;
  if (
    parsedOwnerLogin &&
    normalizeOwnerLogin(parsedOwnerLogin) !== normalizedOwnerLogin
  ) {
    return false;
  }

  return true;
};

export const scoreCacheGist = (gist: CacheGist, ownerLogin: string) => {
  const parsed = parseCache(gist);
  const normalizedOwnerLogin = normalizeOwnerLogin(ownerLogin);
  const expectedCacheKey = getExpectedCacheKey(normalizedOwnerLogin);

  let score = 0;

  if (hasCacheFilename(gist)) score += 10;
  if (isCacheDescription(gist.description)) score += 5;
  if (parsed) score += 20;

  const parsedOwnerLogin = parsed?.metadata?.ownerLogin?.toLowerCase();
  const parsedCacheKey = parsed?.metadata?.cacheKey;

  if (parsedOwnerLogin === normalizedOwnerLogin) score += 40;
  if (parsedCacheKey === expectedCacheKey) score += 80;
  if (gist.description?.includes(expectedCacheKey)) score += 20;

  return score;
};

const sortByRecencyDesc = (left?: string | null, right?: string | null) => {
  const leftTimestamp = left ? Date.parse(left) : 0;
  const rightTimestamp = right ? Date.parse(right) : 0;
  return rightTimestamp - leftTimestamp;
};

const selectCanonicalCacheGist = (gists: CacheGist[], ownerLogin: string) => {
  return [...gists].sort((left, right) => {
    const scoreDelta =
      scoreCacheGist(right, ownerLogin) - scoreCacheGist(left, ownerLogin);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return sortByRecencyDesc(left.updatedAt, right.updatedAt);
  });
};

const needsMetadataMigration = (cachedData: CachedData, ownerLogin: string) => {
  const normalizedOwnerLogin = normalizeOwnerLogin(ownerLogin);
  return (
    cachedData.metadata.cacheVersion !== GIST_CACHE_VERSION ||
    cachedData.metadata.ownerLogin?.toLowerCase() !== normalizedOwnerLogin ||
    cachedData.metadata.cacheKey !== getExpectedCacheKey(normalizedOwnerLogin)
  );
};

const needsDescriptionMigration = (gist: CacheGist, ownerLogin: string) =>
  gist.description !== buildCacheDescription(ownerLogin);

export const getGistIdentifier = (
  gist: Partial<CacheGist> | null | undefined
) => {
  if (!gist) return null;

  return gist.id ?? gist.name ?? null;
};

// Parsing a multi-megabyte cache is expensive and scoring/sorting candidates
// asks for it repeatedly; memoize per gist object (and file text).
const parsedCacheMemo = new WeakMap<
  CacheGist,
  { text: string | null | undefined; data: CachedData | null }
>();

/**
 * Parses the content of a Gist object retrieved from the API. Accepts both the
 * compact format and caches written before it existed.
 */
export const parseCache = (gist: CacheGist): CachedData | null => {
  const file = gist.files.find((candidate) => candidate.name === GIST_FILENAME);
  const content = file?.text;

  const memo = parsedCacheMemo.get(gist);
  if (memo && memo.text === content) return memo.data;

  let data: CachedData | null = null;
  try {
    if (content && !file?.truncated) {
      data = decodeCache(JSON.parse(content));
    }
  } catch (error) {
    console.error('Failed to parse cache content:', error);
  }

  parsedCacheMemo.set(gist, { text: content, data });
  return data;
};

export const normalizeCachedData = (
  cachedData: CachedData,
  ownerLogin: string
): CachedData => {
  const normalizedOwnerLogin = normalizeOwnerLogin(ownerLogin);

  return {
    ...cachedData,
    metadata: {
      ...cachedData.metadata,
      cacheVersion: GIST_CACHE_VERSION,
      ownerLogin: normalizedOwnerLogin,
      cacheKey: getExpectedCacheKey(normalizedOwnerLogin),
    },
  };
};

/**
 * A remembered gist that is unambiguously this account's current cache: owned
 * by the account, parseable, and tagged with the expected cache key.
 */
const isValidatedCanonical = (gist: CacheGist, ownerLogin: string) =>
  isCacheGistOwnedBy(gist, ownerLogin) &&
  parseCache(gist)?.metadata?.cacheKey === getExpectedCacheKey(ownerLogin);

/**
 * The login every listed gist is owned by, when they agree. `GET /gists` only
 * returns the authenticated account's own gists, so this is its current login.
 */
const getListedOwnerLogin = (summaries: GitHubGistSummary[]) => {
  const logins = new Set(
    summaries
      .map((gist) => gist.owner?.login)
      .filter((login): login is string => Boolean(login))
      .map(normalizeOwnerLogin)
  );
  return logins.size === 1 ? [...logins][0] : null;
};

export const findCanonicalCacheGist = async ({
  ownerLogin: sessionOwnerLogin,
  viewerLogin,
  preferredGistId,
  fullScan = false,
}: {
  /** The login the session knows (may be stale after a GitHub rename). */
  ownerLogin: string;
  /** The GraphQL viewer login, when already known; authoritative. */
  viewerLogin?: string | null;
  preferredGistId?: string | null;
  /**
   * List every gist even when the remembered one validates — needed to find
   * duplicates. Off by default: listing and downloading every candidate on
   * each load is slow and burns rate limit for accounts with many gists.
   */
  fullScan?: boolean;
}): Promise<CacheDiscoveryResult> => {
  const candidateMap = new Map<string, CacheGist>();
  let ownerLogin = normalizeOwnerLogin(viewerLogin || sessionOwnerLogin);

  if (preferredGistId) {
    try {
      const preferredGist = await fetchGistById(preferredGistId);
      if (
        preferredGist &&
        (isCacheDescription(preferredGist.description) ||
          hasCacheFilename(preferredGist))
      ) {
        if (!fullScan && isValidatedCanonical(preferredGist, ownerLogin)) {
          return {
            canonicalGist: preferredGist,
            duplicateGists: [],
            scannedAll: false,
            resolvedOwnerLogin: ownerLogin,
          };
        }
        candidateMap.set(preferredGist.id, preferredGist);
      }
    } catch (error) {
      console.warn('Failed to fetch preferred cache gist by id.', error);
    }
  }

  const summaries = await listAllGists();
  if (!viewerLogin) {
    ownerLogin = getListedOwnerLogin(summaries) ?? ownerLogin;
  }
  const candidateSummaries = summaries.filter(isPotentialCacheGistSummary);

  const unfetchedSummaries = candidateSummaries.filter(
    (gist) => !candidateMap.has(gist.id)
  );

  const fetchedCandidates = await mapWithConcurrency(
    unfetchedSummaries,
    GIST_FETCH_CONCURRENCY,
    async (gist) => {
      try {
        return await fetchGistById(gist.id);
      } catch (error) {
        console.warn('Failed to fetch candidate cache gist by id.', error);
        return null;
      }
    }
  );

  for (const gist of fetchedCandidates) {
    if (gist) {
      candidateMap.set(gist.id, gist);
    }
  }

  const validCandidates = Array.from(candidateMap.values()).filter(
    (gist) =>
      isCacheGistOwnedBy(gist, ownerLogin) &&
      scoreCacheGist(gist, ownerLogin) > 0
  );

  if (validCandidates.length === 0) {
    return {
      canonicalGist: null,
      duplicateGists: [],
      scannedAll: true,
      resolvedOwnerLogin: ownerLogin,
    };
  }

  const sortedCandidates = selectCanonicalCacheGist(
    validCandidates,
    ownerLogin
  );
  const [canonicalGist, ...duplicateGists] = sortedCandidates;

  return {
    canonicalGist,
    duplicateGists,
    scannedAll: true,
    resolvedOwnerLogin: ownerLogin,
  };
};

const updateCacheGist = async (
  gistId: string,
  body: object
): Promise<CacheGist | null> => {
  // 404 -> null: the gist was deleted out from under us, so the caller falls
  // back to discovery/create.
  const updatedGist = await ghRest<GitHubGistDetail>(`/gists/${gistId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });

  return updatedGist ? toCacheGist(updatedGist) : null;
};

const createCacheGist = async (body: object) => {
  const createdGist = await ghRest<GitHubGistDetail>('/gists', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });

  if (!createdGist) {
    throw new Error('Failed to create Gist cache.');
  }

  return toCacheGist(createdGist);
};

const deleteGist = (gistId: string) =>
  ghRestOk(`/gists/${gistId}`, { method: 'DELETE' });

export const cleanupDuplicateCacheGists = async ({
  ownerLogin,
  viewerLogin,
  preferredGistId,
}: {
  ownerLogin: string;
  viewerLogin?: string | null;
  preferredGistId?: string | null;
}) => {
  const discoveryResult = await findCanonicalCacheGist({
    ownerLogin,
    viewerLogin,
    preferredGistId,
    fullScan: true,
  });

  if (!discoveryResult.canonicalGist) {
    return {
      canonicalGist: null,
      deletedCount: 0,
      remainingDuplicateCount: 0,
    };
  }

  const deletionResults = await mapWithConcurrency(
    discoveryResult.duplicateGists,
    GIST_FETCH_CONCURRENCY,
    async (gist) => {
      try {
        const deleted = await deleteGist(gist.id);
        return deleted ? 1 : 0;
      } catch (error) {
        console.warn('Failed to delete duplicate cache gist.', error);
        return 0;
      }
    }
  );

  const deletedCount = deletionResults.filter((count) => count === 1).length;

  const refreshedResult = await findCanonicalCacheGist({
    ownerLogin,
    viewerLogin: discoveryResult.resolvedOwnerLogin,
    preferredGistId: discoveryResult.canonicalGist.id,
    fullScan: true,
  });

  return {
    canonicalGist:
      refreshedResult.canonicalGist ?? discoveryResult.canonicalGist,
    deletedCount,
    remainingDuplicateCount: refreshedResult.duplicateGists.length,
  };
};

export const writeCache = async (
  data: CachedData,
  gistId?: string | null,
  options: WriteCacheOptions = {}
) => {
  const ownerLogin = data.metadata.ownerLogin;
  if (!ownerLogin) {
    throw new Error('Cannot write cache without an owner login.');
  }

  const normalizedData = normalizeCachedData(data, ownerLogin);
  const normalizedOwnerLogin = normalizedData.metadata.ownerLogin;

  if (!normalizedOwnerLogin) {
    throw new Error('Cannot write cache without a normalized owner login.');
  }

  const body = {
    description: buildCacheDescription(normalizedOwnerLogin),
    files: {
      [GIST_FILENAME]: {
        // Compact (not pretty-printed) — pretty-printing inflates the payload
        // ~35%, and large networks can approach GitHub's per-file gist limit.
        // ASCII-escaped so GitHub never flags the gist for bidirectional or
        // hidden Unicode coming from account display names. See serializeCache.
        content: serializeCache(encodeCache(normalizedData)),
      },
    },
    public: false,
  };

  const updateTargets = new Set<string>();
  if (gistId) {
    updateTargets.add(gistId);
  }

  for (const targetId of updateTargets) {
    const updatedGist = await updateCacheGist(targetId, body);
    if (updatedGist) {
      return updatedGist;
    }
  }

  if (options.discoverCanonicalFallback) {
    const discoveryResult = await findCanonicalCacheGist({
      ownerLogin: normalizedOwnerLogin,
      preferredGistId: gistId,
      fullScan: true,
    });

    const canonicalGistId = discoveryResult.canonicalGist?.id;
    if (canonicalGistId && !updateTargets.has(canonicalGistId)) {
      const updatedGist = await updateCacheGist(canonicalGistId, body);
      if (updatedGist) {
        return updatedGist;
      }
    }
  }

  return createCacheGist(body);
};

export const shouldMigrateCanonicalCache = (
  gist: CacheGist,
  cachedData: CachedData,
  ownerLogin: string
) => {
  return (
    needsMetadataMigration(cachedData, ownerLogin) ||
    needsDescriptionMigration(gist, ownerLogin)
  );
};
