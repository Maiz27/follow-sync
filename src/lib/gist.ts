import { CacheGist, CachedData } from './types';
import {
  GIST_CACHE_VERSION,
  GIST_DESCRIPTION_PREFIX,
  GIST_FILENAME,
} from './constants';
import { ghRest, ghRestOk } from './ghRest';

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
  files?: Record<string, { filename?: string | null }>;
};

type GitHubGistDetail = GitHubGistSummary & {
  files?: Record<string, { filename?: string | null; content?: string | null }>;
};

export type CacheDiscoveryResult = {
  canonicalGist: CacheGist | null;
  duplicateGists: CacheGist[];
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
export const serializeCache = (data: CachedData): string =>
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
  description: gist.description,
  updatedAt: gist.updated_at,
  files: Object.values(gist.files ?? {}).map((file) => ({
    name: file.filename ?? '',
    text: file.content ?? null,
  })),
});

const fetchGistById = async (gistId: string) => {
  const gist = await ghRest<GitHubGistDetail>(`/gists/${gistId}`);

  return gist ? toCacheGist(gist) : null;
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

export const scoreCacheGist = (gist: CacheGist, ownerLogin: string) => {
  const parsed = parseCache(gist);
  const normalizedOwnerLogin = normalizeOwnerLogin(ownerLogin);
  const expectedCacheKey = getExpectedCacheKey(normalizedOwnerLogin);

  let score = 0;

  if (hasCacheFilename(gist)) score += 10;
  if (isCacheDescription(gist.description)) score += 5;
  if (parsed) score += 20;

  const parsedOwnerLogin = parsed?.metadata.ownerLogin?.toLowerCase();
  const parsedCacheKey = parsed?.metadata.cacheKey;

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

/**
 * Parses the content of a Gist object retrieved from the API.
 */
export const parseCache = (gist: CacheGist): CachedData | null => {
  try {
    const file = gist.files.find(
      (candidate) => candidate.name === GIST_FILENAME
    );
    const content = file?.text;
    if (!content) return null;
    return JSON.parse(content) as CachedData;
  } catch (error) {
    console.error('Failed to parse cache content:', error);
    return null;
  }
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

export const findCanonicalCacheGist = async ({
  ownerLogin,
  preferredGistId,
}: {
  ownerLogin: string;
  preferredGistId?: string | null;
}): Promise<CacheDiscoveryResult> => {
  const candidateMap = new Map<string, CacheGist>();

  if (preferredGistId) {
    try {
      const preferredGist = await fetchGistById(preferredGistId);
      if (
        preferredGist &&
        (isCacheDescription(preferredGist.description) ||
          hasCacheFilename(preferredGist))
      ) {
        candidateMap.set(preferredGist.id, preferredGist);
      }
    } catch (error) {
      console.warn('Failed to fetch preferred cache gist by id.', error);
    }
  }

  const summaries = await listAllGists();
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
    (gist) => scoreCacheGist(gist, ownerLogin) > 0
  );

  if (validCandidates.length === 0) {
    return { canonicalGist: null, duplicateGists: [] };
  }

  const sortedCandidates = selectCanonicalCacheGist(
    validCandidates,
    ownerLogin
  );
  const [canonicalGist, ...duplicateGists] = sortedCandidates;

  return {
    canonicalGist,
    duplicateGists,
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
  preferredGistId,
}: {
  ownerLogin: string;
  preferredGistId?: string | null;
}) => {
  const discoveryResult = await findCanonicalCacheGist({
    ownerLogin,
    preferredGistId,
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
    preferredGistId: discoveryResult.canonicalGist.id,
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
        content: serializeCache(normalizedData),
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
