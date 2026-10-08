import { CacheGist, CacheGistFile, CachedData } from './types';
import {
  CACHE_CHUNK_CHARS,
  GIST_CACHE_VERSION,
  GIST_CHUNK_PREFIX,
  GIST_DESCRIPTION_PREFIX,
  GIST_FILENAME,
  GIST_VIEW_HEADER,
  MAX_GIST_WRITE_BYTES,
} from './constants';
import { GitHubRestError, ghGistRaw, ghRest, ghRestOk } from './ghRest';
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

  // Files over 1 MB come back truncated (and the proxy drops inline content
  // that would push its response over the host's body limit); load those
  // from raw_url so the cache parses instead of triggering a full sync.
  const cacheFile = cacheGist.files.find((file) => file.name === GIST_FILENAME);
  if (cacheFile) await loadFullText(cacheFile);

  // A sharded cache: load the chunks its manifest names the same way.
  const manifest = readManifest(cacheFile?.text);
  if (manifest) {
    const chunkFiles = manifest.chunks
      .map((ref) => cacheGist.files.find((file) => file.name === ref.file))
      .filter((file): file is CacheGistFile => Boolean(file));
    await mapWithConcurrency(chunkFiles, GIST_FETCH_CONCURRENCY, loadFullText);
  }

  return cacheGist;
};

const loadFullText = async (file: CacheGistFile) => {
  if ((file.truncated || typeof file.text !== 'string') && file.rawUrl) {
    try {
      file.text = await ghGistRaw(file.rawUrl);
      file.truncated = false;
    } catch (error) {
      // Too large for the host to relay (an old single-file cache): keep the
      // gist as an unreadable cache candidate, so the next sync rewrites it
      // in chunks instead of leaving it behind and creating another gist.
      if (error instanceof GitHubRestError && error.status === 413) {
        file.truncated = true;
        return;
      }
      throw error;
    }
  }
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
// asks for it repeatedly; memoize per gist object (and file texts).
const parsedCacheMemo = new WeakMap<
  CacheGist,
  { signature: string; data: CachedData | null }
>();

/**
 * Sharded cache format ('4.0'). The file named `GIST_FILENAME` holds only this
 * manifest; the compact cache document (see cacheCodec), serialized, is cut
 * into chunk files of at most `CACHE_CHUNK_CHARS` characters. That keeps every
 * request and response under the host's body limit however large the network
 * is: each chunk is written and read on its own when needed.
 *
 * Chunk files are named after the write's `generation`, so a new write never
 * touches the chunks the current manifest points to: chunks are written
 * first and the manifest last, and a write that fails half-way leaves the
 * previous cache intact (its orphaned chunks are removed by the next write).
 * A reader only uses the chunks the manifest lists, with the lengths it
 * records. The manifest also carries `metadata` and `timestamp`, so older
 * code reads it as an outdated cache and resyncs instead of failing.
 */
export const SHARDED_CACHE_FORMAT = 'sharded-1';

type ChunkRef = { file: string; length: number };

export type ShardedManifest = {
  format: typeof SHARDED_CACHE_FORMAT;
  generation: string;
  chunks: ChunkRef[];
  timestamp: number;
  syncedAt?: number;
  metadata: CachedData['metadata'];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isShardedManifest = (value: unknown): value is ShardedManifest =>
  isRecord(value) &&
  value.format === SHARDED_CACHE_FORMAT &&
  typeof value.generation === 'string' &&
  Array.isArray(value.chunks) &&
  value.chunks.length > 0 &&
  value.chunks.every(
    (ref) =>
      isRecord(ref) &&
      typeof ref.file === 'string' &&
      ref.file.startsWith(`${GIST_CHUNK_PREFIX}${value.generation}.`) &&
      typeof ref.length === 'number'
  );

const readManifest = (content: string | null | undefined) => {
  if (!content) return null;
  try {
    const value: unknown = JSON.parse(content);
    return isShardedManifest(value) ? value : null;
  } catch {
    return null;
  }
};

/** Cuts `text` into consecutive pieces of at most `size` characters. */
export const splitIntoChunks = (text: string, size = CACHE_CHUNK_CHARS) => {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length ? chunks : [''];
};

const chunkFileName = (generation: string, index: number) =>
  `${GIST_CHUNK_PREFIX}${generation}.${index + 1}`;

export const isCacheChunkFile = (name: string) =>
  name.startsWith(GIST_CHUNK_PREFIX);

/** A fresh id for one cache write; names that write's chunk files. */
export const newGeneration = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The gist files of a sharded cache: chunk files plus the manifest. */
export const buildShardedCache = (data: CachedData, generation: string) => {
  // ASCII-escaped (see serializeCache), so length is bytes on the wire.
  const payload = serializeCache(encodeCache(data));
  const chunks = splitIntoChunks(payload).map((content, index) => ({
    file: chunkFileName(generation, index),
    content,
  }));
  const manifest: ShardedManifest = {
    format: SHARDED_CACHE_FORMAT,
    generation,
    chunks: chunks.map(({ file, content }) => ({
      file,
      length: content.length,
    })),
    timestamp: data.timestamp,
    ...(data.syncedAt === undefined ? {} : { syncedAt: data.syncedAt }),
    metadata: data.metadata,
  };
  return { manifest: serializeCache(manifest), chunks };
};

/**
 * Reassembles a sharded cache from the chunk files its manifest lists. Null
 * when any chunk is missing, not loaded, or not the length the manifest
 * recorded (e.g. left over from a different write).
 */
const decodeSharded = (gist: CacheGist, manifest: ShardedManifest) => {
  const pieces: string[] = [];
  for (const ref of manifest.chunks) {
    const file = gist.files.find((candidate) => candidate.name === ref.file);
    if (
      !file ||
      file.truncated ||
      typeof file.text !== 'string' ||
      file.text.length !== ref.length
    ) {
      return null;
    }
    pieces.push(file.text);
  }
  return decodeCache(JSON.parse(pieces.join('')));
};

const parseSignature = (gist: CacheGist) =>
  gist.files
    .map(
      (file) =>
        `${file.name}:${file.truncated ? 't' : ''}:${file.text?.length ?? -1}`
    )
    .join('|');

/**
 * Parses the content of a Gist object retrieved from the API. Accepts the
 * sharded format and the single-file caches written before it (compact-1
 * and legacy objects).
 */
export const parseCache = (gist: CacheGist): CachedData | null => {
  const file = gist.files.find((candidate) => candidate.name === GIST_FILENAME);
  const content = file?.text;

  const signature = parseSignature(gist);
  const memo = parsedCacheMemo.get(gist);
  if (memo && memo.signature === signature) return memo.data;

  let data: CachedData | null = null;
  try {
    if (content && !file?.truncated) {
      const value: unknown = JSON.parse(content);
      data = isShardedManifest(value)
        ? decodeSharded(gist, value)
        : decodeCache(value);
    }
  } catch (error) {
    console.error('Failed to parse cache content:', error);
  }

  parsedCacheMemo.set(gist, { signature, data });
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

type GistFileWrite = { content: string } | null;
type GistFiles = Record<string, GistFileWrite>;

type CacheWritePlan = {
  description: string;
  manifest: string;
  chunks: Array<{ file: string; content: string }>;
};

/**
 * Serialized size of one `files` entry in a write body. Contents are ASCII
 * (see serializeCache), so string length is the byte count.
 */
const fileEntryBytes = (name: string, entry: GistFileWrite) =>
  JSON.stringify(name).length +
  (entry ? JSON.stringify(entry.content).length + 16 : 5);

const filesBytes = (files: GistFiles) =>
  Object.entries(files).reduce(
    (total, [name, entry]) => total + fileEntryBytes(name, entry),
    0
  );

/** Headroom for the description and the rest of the body around `files`. */
const BODY_OVERHEAD_BYTES = 2_048;

/** Groups files into write bodies of at most `MAX_GIST_WRITE_BYTES`. */
const batchFiles = (files: GistFiles) => {
  const budget = MAX_GIST_WRITE_BYTES - BODY_OVERHEAD_BYTES;
  const batches: GistFiles[] = [];
  let current: GistFiles = {};
  let currentBytes = 0;
  for (const [name, entry] of Object.entries(files)) {
    const bytes = fileEntryBytes(name, entry);
    if (currentBytes > 0 && currentBytes + bytes > budget) {
      batches.push(current);
      current = {};
      currentBytes = 0;
    }
    current[name] = entry;
    currentBytes += bytes;
  }
  if (currentBytes > 0) batches.push(current);
  return batches;
};

const patchGist = async (
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

const postGist = async (body: object) => {
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

/**
 * The gist's file names, without their contents (the proxy drops them on
 * request). Null when the gist no longer exists.
 */
const fetchGistFileNames = async (gistId: string) => {
  const gist = await ghRest<GitHubGistDetail>(`/gists/${gistId}`, {
    headers: { [GIST_VIEW_HEADER]: 'meta' },
  });
  if (!gist) return null;
  return Object.values(gist.files ?? {})
    .map((file) => file.filename ?? '')
    .filter(Boolean);
};

/**
 * Writes a sharded cache to `gistId` (or a new gist when null). Small caches
 * go out in one request. Larger ones are split so no request body exceeds
 * `MAX_GIST_WRITE_BYTES`: chunk files first, then the manifest, which is what
 * makes the new chunks the cache. Chunk files no manifest will reference any
 * more (the previous write's, or orphans of a failed one) are deleted with
 * the manifest. Null when the gist disappeared.
 */
const writeShardedCache = async (
  gistId: string | null,
  plan: CacheWritePlan
): Promise<CacheGist | null> => {
  const chunkFiles: GistFiles = Object.fromEntries(
    plan.chunks.map(({ file, content }) => [file, { content }])
  );
  const finalFiles: GistFiles = {
    [GIST_FILENAME]: { content: plan.manifest },
  };

  if (gistId) {
    const existing = await fetchGistFileNames(gistId);
    if (!existing) return null;
    for (const name of existing) {
      if (isCacheChunkFile(name) && !(name in chunkFiles)) {
        finalFiles[name] = null;
      }
    }
  }

  const allFiles = { ...chunkFiles, ...finalFiles };
  if (filesBytes(allFiles) + BODY_OVERHEAD_BYTES <= MAX_GIST_WRITE_BYTES) {
    return gistId
      ? patchGist(gistId, { description: plan.description, files: allFiles })
      : postGist({
          description: plan.description,
          public: false,
          files: allFiles,
        });
  }

  let targetId = gistId;
  for (const files of batchFiles(chunkFiles)) {
    if (!targetId) {
      // Created without a manifest, so it isn't a readable cache until the
      // last request below lands.
      const created = await postGist({
        description: plan.description,
        public: false,
        files,
      });
      targetId = created.id;
      continue;
    }
    if (!(await patchGist(targetId, { files }))) return null;
  }

  return patchGist(targetId!, {
    description: plan.description,
    files: finalFiles,
  });
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

  const { manifest, chunks } = buildShardedCache(
    normalizedData,
    newGeneration()
  );
  const plan: CacheWritePlan = {
    description: buildCacheDescription(normalizedOwnerLogin),
    manifest,
    chunks,
  };

  const updateTargets = new Set<string>();
  if (gistId) {
    updateTargets.add(gistId);
  }

  for (const targetId of updateTargets) {
    const updatedGist = await writeShardedCache(targetId, plan);
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
      const updatedGist = await writeShardedCache(canonicalGistId, plan);
      if (updatedGist) {
        return updatedGist;
      }
    }
  }

  const createdGist = await writeShardedCache(null, plan);
  if (!createdGist) {
    throw new Error('Failed to create Gist cache.');
  }
  return createdGist;
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
