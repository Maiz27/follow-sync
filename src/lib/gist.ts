import { CacheGist, CacheGistFile, CachedData, GistRevision } from './types';
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
import { DatedRevision, sortRevisionsNewestFirst } from './revisionOrder';
import {
  CacheBase,
  isSameRevision,
  mergeCacheData,
  toCacheBase,
} from './cacheMerge';

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
  /**
   * Revisions (the proxy keeps the latest few). Documented as deprecated and
   * optional, so everything here works without it. Put in order with
   * sortRevisionsNewestFirst rather than trusting the order given.
   */
  history?: Array<DatedRevision | null> | null;
  /**
   * Set when the gist has more files than GitHub lists in one response
   * (300): `files` is then only part of them.
   */
  truncated?: boolean;
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
  /**
   * Called with the merged cache when the gist had changed elsewhere and the
   * write merged those changes in (see writeCacheTo), so the caller can show
   * them.
   *
   * The write records what it wrote as this session's base for the next
   * write, which is only right if the caller's state (the stores) now holds
   * it too: the next write takes anything the base has and the state lacks
   * for a removal made here. So the caller loads the merged cache and
   * returns true, or returns false when it can't (its state belongs to
   * someone else now); without an `onMerged` that adopts it, the write
   * records no base, and the next one merges without one (keeping
   * everything).
   */
  onMerged?: (merged: CachedData) => boolean;
  /**
   * Called when the write went through but left something the user should
   * know about (e.g. it replaced a cache that couldn't be read).
   */
  onWarning?: (message: string) => void;
};

/**
 * The gist holds a cache this code can't read, and writing would destroy it:
 * a corrupt or hand-edited cache file, or one written by a newer version of
 * the app. Nothing is written; the user decides what to do with the gist.
 */
export class CacheUnreadableError extends Error {
  readonly gistId: string;
  /** What to tell the user (see toUserMessage). */
  readonly userMessage: string;

  constructor(gistId: string) {
    super(`The cache gist ${gistId} holds a cache that can't be read.`);
    this.name = 'CacheUnreadableError';
    this.gistId = gistId;
    this.userMessage = `Your cache gist (${gistId}) holds a cache this version of Follow Sync can't read, so it wasn't overwritten. Rename or delete its "${GIST_FILENAME}" file on GitHub to start a new cache.`;
  }
}

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

/** The history versions a gist response listed, newest first, if any. */
const historyVersions = (gist: GitHubGistDetail): string[] | null => {
  if (!Array.isArray(gist.history) || gist.history.length === 0) return null;
  return sortRevisionsNewestFirst(gist.history).map(
    (entry) => entry.version as string
  );
};

/** The cache manifest a gist response carries inline, if any. */
const responseManifest = (gist: GitHubGistDetail) =>
  readManifest(
    Object.values(gist.files ?? {}).find(
      (file) => file.filename === GIST_FILENAME
    )?.content
  );

const gistRevision = (gist: GitHubGistDetail): GistRevision => ({
  version: historyVersions(gist)?.[0] ?? null,
  generation: responseManifest(gist)?.generation ?? null,
});

const toCacheGist = (gist: GitHubGistDetail): CacheGist => ({
  id: gist.id,
  name: gist.id,
  ownerLogin: gist.owner?.login ?? null,
  description: gist.description,
  updatedAt: gist.updated_at,
  revision: gistRevision(gist),
  ...(gist.truncated ? { filesTruncated: true } : {}),
  files: Object.values(gist.files ?? {}).map((file) => ({
    name: file.filename ?? '',
    text: file.content ?? null,
    truncated: Boolean(file.truncated),
    rawUrl: file.raw_url ?? null,
  })),
});

/** `/gists/{id}`, or `/gists/{id}/{version}` for an earlier revision. */
const gistPath = (gistId: string, version?: string | null) =>
  version ? `/gists/${gistId}/${version}` : `/gists/${gistId}`;

/**
 * Reads a gist with every cache file's full content: the current revision,
 * or `version` (an earlier one: its raw URLs point at that revision's file
 * contents, so a sharded cache reads back exactly as it was then).
 */
const fetchGistById = async (gistId: string, version?: string | null) => {
  const gist = await ghRest<GitHubGistDetail>(gistPath(gistId, version));
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
    if (cacheGist.filesTruncated) listUnlistedChunks(cacheGist, manifest);
    const chunkFiles = manifest.chunks
      .map((ref) => cacheGist.files.find((file) => file.name === ref.file))
      .filter((file): file is CacheGistFile => Boolean(file));
    await mapWithConcurrency(chunkFiles, GIST_FETCH_CONCURRENCY, loadFullText);
  }

  return cacheGist;
};

/**
 * A gist with more files than GitHub lists (300; orphaned chunk files of
 * failed writes pile up until they are old enough to sweep, see
 * staleChunkFiles) may leave out chunks its manifest needs. They are read
 * from raw URLs next to the manifest's: same gist and revision, their own
 * file name. If that doesn't work, the read fails rather than the cache
 * looking broken.
 */
const listUnlistedChunks = (gist: CacheGist, manifest: ShardedManifest) => {
  const manifestUrl = gist.files.find(
    (file) => file.name === GIST_FILENAME
  )?.rawUrl;
  console.warn(
    'The cache gist has more files than GitHub lists; reading unlisted chunks by URL.'
  );
  if (!manifestUrl) return;
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  for (const ref of manifest.chunks) {
    if (gist.files.some((file) => file.name === ref.file)) continue;
    gist.files.push({
      name: ref.file,
      text: null,
      truncated: true,
      rawUrl: `${base}${encodeURIComponent(ref.file)}`,
    });
  }
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
  /** Unique per cache write; names its chunk files. */
  generation: string;
  /**
   * The generation of the cache this write was based on (what the gist held
   * when it checked, merged in). Lets a writer that overwrote this one merge
   * against the right base. Absent when unknown.
   */
  parent?: string | null;
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

/**
 * A fresh id for one cache write; names that write's chunk files. Starts
 * with the time the write started (`Date.now()` in base 36), which tells how
 * old an orphaned chunk is (see generationStartedAt), then a random part.
 */
export const newGeneration = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The gist files of a sharded cache: chunk files plus the manifest. */
export const buildShardedCache = (
  data: CachedData,
  generation: string,
  parent: string | null = null
) => {
  // ASCII-escaped (see serializeCache), so length is bytes on the wire.
  const payload = serializeCache(encodeCache(data));
  const chunks = splitIntoChunks(payload).map((content, index) => ({
    file: chunkFileName(generation, index),
    content,
  }));
  const manifest: ShardedManifest = {
    format: SHARDED_CACHE_FORMAT,
    generation,
    ...(parent ? { parent } : {}),
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
  failOnReadError = false,
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
  /**
   * Throw when a candidate can't be read instead of leaving it out. A write
   * that falls back to discovery needs this: leaving the existing cache out
   * would create a second one next to it (and the duplicate cleanup could
   * then delete the original).
   */
  failOnReadError?: boolean;
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
      if (failOnReadError) throw error;
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
        if (failOnReadError) throw error;
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

/** A gist as a write request returned it, plus what verification needs. */
type GistWriteResponse = {
  gist: CacheGist;
  /** The response's history versions, newest first; null without history. */
  history: string[] | null;
};

const toWriteResponse = (gist: GitHubGistDetail): GistWriteResponse => ({
  gist: toCacheGist(gist),
  history: historyVersions(gist),
});

const patchGist = async (
  gistId: string,
  body: object
): Promise<GistWriteResponse | null> => {
  // 404 -> null: the gist was deleted out from under us, so the caller falls
  // back to discovery/create.
  const updatedGist = await ghRest<GitHubGistDetail>(`/gists/${gistId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });

  return updatedGist ? toWriteResponse(updatedGist) : null;
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

  return toWriteResponse(createdGist);
};

/**
 * A gist's (or an earlier revision's) file names, revision and cache
 * manifest, without the cache contents: the proxy drops every file content
 * except a small manifest on request. Null when the gist (or revision) no
 * longer exists.
 */
const fetchGistMeta = async (gistId: string, version?: string | null) => {
  const gist = await ghRest<GitHubGistDetail>(gistPath(gistId, version), {
    headers: { [GIST_VIEW_HEADER]: 'meta' },
  });
  if (!gist) return null;
  return {
    revision: gistRevision(gist),
    manifest: responseManifest(gist),
    files: Object.values(gist.files ?? {})
      .map((file) => file.filename ?? '')
      .filter(Boolean),
    filesTruncated: Boolean(gist.truncated),
  };
};

/** Gist commits per page when the history has to be listed separately. */
const COMMITS_PER_PAGE = 100;
/** Commits listed to find the newest one (see writeCacheTo). */
const ANCHOR_COMMITS = 10;

/**
 * The gist's revisions, newest first, from `GET /gists/{id}/commits` (the
 * documented, non-deprecated list; put in order by sortRevisionsNewestFirst
 * rather than trusting the order given). Null when it can't be listed.
 */
const listGistVersions = async (gistId: string, perPage: number) => {
  try {
    const commits = await ghRest<DatedRevision[]>(
      `/gists/${gistId}/commits?per_page=${perPage}`
    );
    return sortRevisionsNewestFirst(commits ?? []).map(
      (commit) => commit.version as string
    );
  } catch (error) {
    console.warn('Failed to list the cache gist revisions.', error);
    return null;
  }
};

/**
 * Per cache gist: the revision this session last read or wrote, and what it
 * held (see CacheBase). Module-level like the write queue, so every hook
 * instance shares it.
 */
const cacheBases = new Map<string, CacheBase>();

/**
 * Per cache gist: generations of this session's writes that failed after
 * uploading some chunks. No manifest will ever reference those chunks, so
 * the next write deletes them without waiting for them to age (see
 * staleChunkFiles).
 */
const abandonedGenerations = new Map<string, Set<string>>();

/**
 * Records that this session's state is based on `data`, read from `gist`.
 * Call it when a cache is loaded into the stores; writes record their own.
 */
export const rememberCacheBase = (gist: CacheGist, data: CachedData) => {
  cacheBases.set(gist.id, toCacheBase(gist.revision ?? null, data));
};

/** Forgets every recorded base (e.g. on sign-out). */
export const forgetCacheBases = () => {
  cacheBases.clear();
  abandonedGenerations.clear();
};

/**
 * Chunk files younger than this are never deleted unless this write knows
 * whose they are: they may belong to another device's write that is still
 * uploading them (its manifest lands after its last chunk). A write of the
 * largest caches takes well under a minute; the margin covers slow
 * connections and clocks that disagree by a few minutes.
 */
export const ORPHAN_CHUNK_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Characters of a generation that encode when its write started:
 * `Date.now()` in base 36 (see newGeneration) is 8 characters until 2059.
 */
const GENERATION_TIME_CHARS = 8;
/** Generations decoding to earlier times aren't timestamps (sharding is newer). */
const EARLIEST_GENERATION_TIME = Date.UTC(2020, 0, 1);

/** The generation a chunk file belongs to (see chunkFileName), if any. */
const chunkGeneration = (name: string) => {
  if (!isCacheChunkFile(name)) return null;
  const rest = name.slice(GIST_CHUNK_PREFIX.length);
  const dot = rest.lastIndexOf('.');
  return dot > 0 ? rest.slice(0, dot) : null;
};

/** When the write that created `generation` started, if it encodes that. */
export const generationStartedAt = (generation: string): number | null => {
  const head = generation.slice(0, GENERATION_TIME_CHARS);
  if (!/^[0-9a-z]{8}$/.test(head)) return null;
  const time = parseInt(head, 36);
  return time >= EARLIEST_GENERATION_TIME ? time : null;
};

/**
 * The chunk files in `listing` a write deletes along with its manifest:
 *
 * - those of `superseded` generations: caches this write read and merged or
 *   replaced (the manifest it checked, another writer's cache it merged in
 *   after the fact, its own earlier repair rounds and abandoned writes).
 *   Each of those manifests has already landed, so no write still needs
 *   them once this one's manifest replaces whatever is current;
 * - those whose generation started more than ORPHAN_CHUNK_MAX_AGE_MS ago:
 *   orphans of a write that failed half-way.
 *
 * Never the files this write is writing, and never a younger chunk this
 * write knows nothing about, which may be another device's write in
 * progress (deleting those made its manifest land pointing at missing
 * chunks). A file whose name doesn't encode a time is left alone.
 *
 * Deletions go in the same request as this write's manifest, so whichever
 * manifest is current at that moment is replaced along with them.
 */
const staleChunkFiles = (
  listing: readonly string[],
  keep: ReadonlySet<string>,
  superseded: ReadonlySet<string>,
  now: number
) =>
  listing.filter((name) => {
    if (keep.has(name)) return false;
    const generation = chunkGeneration(name);
    if (!generation) return false;
    if (superseded.has(generation)) return true;
    const startedAt = generationStartedAt(generation);
    return startedAt !== null && now - startedAt > ORPHAN_CHUNK_MAX_AGE_MS;
  });

/** What one sharded write produced. */
type ShardedWriteResult = {
  gist: CacheGist;
  /** History versions the write's own requests created, where reported. */
  ownVersions: string[];
  /** Requests that changed the gist (each makes exactly one revision). */
  requests: number;
  /** The final response's history, newest first; null without one. */
  history: string[] | null;
  /** The gist's files after the write (all of them unless `filesTruncated`). */
  files: string[];
  filesTruncated: boolean;
};

const isUnprocessable = (error: unknown) =>
  error instanceof GitHubRestError && error.status === 422;

/**
 * Writes a sharded cache to `gistId` (or a new gist when null). Small caches
 * go out in one request. Larger ones are split so no request body exceeds
 * `MAX_GIST_WRITE_BYTES`: chunk files first, then the manifest, which is what
 * makes the new chunks the cache. Null when the gist disappeared.
 *
 * `deletions` picks the chunk files to delete with the manifest from the
 * freshest file list at hand: the last chunk upload's response, or `listing`
 * (what the caller last saw) for a single request. Should GitHub refuse the
 * request anyway (422, e.g. a file deleted meanwhile), it is sent once more
 * without deletions; those files go with a later write.
 *
 * Every chunk the manifest names is checked against the final response: one
 * that is missing (deleted meanwhile by an older version of this code, which
 * removed every chunk but its own) is uploaded again, so this write never
 * leaves its manifest pointing at missing chunks.
 */
const writeShardedCache = async (
  gistId: string | null,
  plan: CacheWritePlan,
  listing: readonly string[],
  deletions: (listing: readonly string[]) => string[]
): Promise<ShardedWriteResult | null> => {
  const chunkFiles: GistFiles = Object.fromEntries(
    plan.chunks.map(({ file, content }) => [file, { content }])
  );
  const manifestFile: GistFiles = {
    [GIST_FILENAME]: { content: plan.manifest },
  };
  const withDeletions = (files: GistFiles, from: readonly string[]) => {
    const result = { ...files };
    for (const name of deletions(from)) {
      if (!(name in result)) result[name] = null;
    }
    return result;
  };

  const ownVersions: string[] = [];
  let requests = 0;
  const track = (response: GistWriteResponse | null) => {
    if (!response) return null;
    requests += 1;
    const version = response.history?.[0];
    if (version) ownVersions.push(version);
    return response;
  };
  /** PATCH `files`, then once more without its deletions on a 422. */
  const patchFiles = async (
    targetId: string,
    files: GistFiles,
    description?: string
  ) => {
    const body = (entries: GistFiles) =>
      description ? { description, files: entries } : { files: entries };
    try {
      return track(await patchGist(targetId, body(files)));
    } catch (error) {
      const kept = Object.fromEntries(
        Object.entries(files).filter(([, entry]) => entry !== null)
      );
      if (
        !isUnprocessable(error) ||
        Object.keys(kept).length === Object.keys(files).length
      ) {
        throw error;
      }
      console.warn('Retrying a cache write without its deletions.', error);
      return track(await patchGist(targetId, body(kept)));
    }
  };

  let final: GistWriteResponse | null;
  let targetId = gistId;
  const allFiles = { ...chunkFiles, ...manifestFile };
  if (filesBytes(allFiles) + BODY_OVERHEAD_BYTES <= MAX_GIST_WRITE_BYTES) {
    final = targetId
      ? await patchFiles(
          targetId,
          withDeletions(allFiles, listing),
          plan.description
        )
      : track(
          await postGist({
            description: plan.description,
            public: false,
            files: allFiles,
          })
        );
  } else {
    let latest: readonly string[] = listing;
    for (const files of batchFiles(chunkFiles)) {
      if (!targetId) {
        // Created without a manifest, so it isn't a readable cache until the
        // last request below lands.
        const created = track(
          await postGist({
            description: plan.description,
            public: false,
            files,
          })
        )!;
        targetId = created.gist.id;
        latest = [];
        continue;
      }
      const response = track(await patchGist(targetId, { files }));
      if (!response) return null;
      latest = response.gist.files.map((file) => file.name);
    }
    final = await patchFiles(
      targetId!,
      withDeletions(manifestFile, latest),
      plan.description
    );
  }
  if (!final) return null;

  // Chunks missing from the final response are uploaded again (see above).
  // A truncated file list can't tell; its unlisted chunks were just written.
  let response: GistWriteResponse = final;
  if (!response.gist.filesTruncated) {
    const present = new Set(response.gist.files.map((file) => file.name));
    const missing = Object.fromEntries(
      Object.entries(chunkFiles).filter(([name]) => !present.has(name))
    );
    if (Object.keys(missing).length > 0) {
      console.warn('Uploading cache chunks deleted during the write again.');
      for (const files of batchFiles(missing)) {
        const reuploaded = track(await patchGist(targetId!, { files }));
        if (!reuploaded) return null;
        response = reuploaded;
      }
    }
  }

  return {
    gist: response.gist,
    ownVersions,
    requests,
    history: response.history,
    files: response.gist.files.map((file) => file.name),
    filesTruncated: Boolean(response.gist.filesTruncated),
  };
};

/**
 * A cache gist as read to merge with: `data` is what it holds, or null when
 * it holds nothing a merge could keep and may be written over (see
 * readCacheToMerge).
 */
type RemoteCache = { gist: CacheGist; data: CachedData | null };

/** Why a gist's cache didn't parse (see classifyUnreadable). */
type UnreadableCache =
  /** No cache file at all. */
  | 'absent'
  /** A single-file cache too large for the host to relay (from before sharding). */
  | 'too-large'
  /** A sharded manifest whose chunk files are missing or cut short. */
  | 'missing-chunks'
  /** Anything else: corrupt, hand-edited, or a newer app version's format. */
  | 'unknown';

const classifyUnreadable = (gist: CacheGist): UnreadableCache => {
  const file = gist.files.find((candidate) => candidate.name === GIST_FILENAME);
  if (!file) return 'absent';
  // loadFullText leaves a cache file truncated only when the host refused to
  // relay it (413): an old single-file cache, never a manifest.
  if (file.truncated) return 'too-large';
  const manifest = readManifest(file.text);
  if (!manifest) return 'unknown';
  const complete = manifest.chunks.every((ref) => {
    const chunk = gist.files.find((candidate) => candidate.name === ref.file);
    return (
      chunk &&
      !chunk.truncated &&
      typeof chunk.text === 'string' &&
      chunk.text.length === ref.length
    );
  });
  // Every chunk there and still undecodable: corrupt, not merely broken.
  return complete ? 'unknown' : 'missing-chunks';
};

/**
 * Reads the cache a write is about to replace, to merge with. Null when the
 * gist no longer exists.
 *
 * A failed request (5xx, rate limit, a chunk that can't be fetched) throws:
 * the write is abandoned rather than made without the merge, which would
 * drop what another device wrote; the next write tries again. A cache that
 * was read but doesn't parse is only written over when it is known to hold
 * nothing a merge could keep:
 *
 * - a single-file cache too large for the host to relay (from before
 *   sharding: it could never be read here, and rewriting it in chunks is
 *   how it becomes readable again);
 * - a sharded manifest whose chunk files are missing (a write broken by an
 *   older version of this code). Its ignore list and ghost removals lived in
 *   the missing chunks; the manifest itself carries only metadata and times,
 *   which a write replaces anyway. The gist is read a second time first, so
 *   a cache that was only caught mid-write isn't mistaken for a broken one.
 *
 * Anything else that doesn't parse (corrupt, hand-edited, or written by a
 * newer version of the app) throws CacheUnreadableError: overwriting it would
 * destroy it, so the user decides.
 */
const readCacheToMerge = async (
  gistId: string,
  warn?: (message: string) => void
): Promise<RemoteCache | null> => {
  for (let attempt = 0; ; attempt++) {
    const gist = await fetchGistById(gistId);
    if (!gist) return null;
    const data = parseCache(gist);
    if (data) return { gist, data };

    const kind = classifyUnreadable(gist);
    if (kind === 'absent') return { gist, data: null };
    if (kind === 'too-large') {
      console.warn('Rewriting a cache too large to read in chunks.');
      return { gist, data: null };
    }
    if (kind === 'missing-chunks') {
      if (attempt === 0) continue;
      console.warn('Replacing a cache whose chunk files are missing.');
      warn?.(
        'Your cached network was incomplete on GitHub and has been replaced; ignored accounts and removed ghosts saved elsewhere may need to be set again.'
      );
      return { gist, data: null };
    }
    throw new CacheUnreadableError(gistId);
  }
};

/** Repair writes after one another writer interleaved with (see below). */
const MAX_REPAIR_ROUNDS = 2;
/** Earlier revisions inspected per round to find another writer's cache. */
const MAX_REVISION_PROBES = 5;

type InterleavedCheck =
  /** No other writer completed a cache since `since`. */
  | { kind: 'none' }
  /** Another writer's cache landed and this write replaced it. */
  | {
      kind: 'found';
      generation: string;
      parent: string | null;
      data: CachedData;
    }
  /** The revisions couldn't all be listed or read, so it is unknown. */
  | { kind: 'unverified' };

/**
 * Whether another writer completed a cache in the revisions after `since`
 * (which this write already accounted for), and the newest such cache.
 *
 * The revisions come from the final write response's history when it reaches
 * back to `since`, else from the gist's commit list. Revisions this write
 * made itself are skipped; any other is classified by the manifest it holds:
 * a generation that is neither this write's nor already merged is another
 * writer's completed cache. (A revision still holding a known generation is
 * another writer's chunk upload in progress: that writer checks for this
 * write when its own manifest lands.) A revision that can't be listed or
 * read makes the answer `unverified`.
 */
const findInterleavedWrite = async ({
  gistId,
  since,
  result,
  ownVersions,
  requests,
  knownGenerations,
  probed,
}: {
  gistId: string;
  since: string;
  result: ShardedWriteResult;
  ownVersions: ReadonlySet<string>;
  /** Revision-making requests this write made since `since`, all rounds. */
  requests: number;
  knownGenerations: ReadonlySet<string>;
  /** Revisions already inspected (shared across rounds). */
  probed: Set<string>;
}): Promise<InterleavedCheck> => {
  let window: string[] | null = null;
  const start = result.history?.indexOf(since) ?? -1;
  if (result.history && start >= 0) {
    window = result.history.slice(0, start);
  } else {
    // No history in the response (it is deprecated), or cut short.
    const versions = await listGistVersions(gistId, COMMITS_PER_PAGE);
    const index = versions?.indexOf(since) ?? -1;
    if (versions && index >= 0) window = versions.slice(0, index);
  }
  if (!window) {
    console.warn(
      'Could not list the cache gist revisions to check for a concurrent write.'
    );
    return { kind: 'unverified' };
  }
  // Without the versions of its own requests, a window no longer than the
  // requests this write made holds nothing else.
  if (ownVersions.size === 0 && window.length <= requests) {
    return { kind: 'none' };
  }

  const unprobed = window.filter(
    (version) => !ownVersions.has(version) && !probed.has(version)
  );
  let complete = unprobed.length <= MAX_REVISION_PROBES;
  for (const version of unprobed.slice(0, MAX_REVISION_PROBES)) {
    probed.add(version);
    const meta = await fetchGistMeta(gistId, version).catch((error) => {
      console.warn('Failed to read a cache gist revision.', error);
      return undefined;
    });
    if (meta === undefined) {
      complete = false;
      continue;
    }
    const generation = meta?.revision.generation;
    if (!generation || knownGenerations.has(generation)) continue;

    const gist = await fetchGistById(gistId, version).catch((error) => {
      console.warn('Failed to read a cache gist revision.', error);
      return undefined;
    });
    if (gist === undefined) {
      complete = false;
      continue;
    }
    const data = gist ? parseCache(gist) : null;
    // A cache that can't be read holds nothing to merge.
    if (!data) continue;
    return {
      kind: 'found',
      generation,
      parent: meta?.manifest?.parent ?? null,
      data,
    };
  }
  return complete ? { kind: 'none' } : { kind: 'unverified' };
};

/**
 * Makes sure the gist's current manifest can be read once this write is
 * done: every chunk it names is there. Called when the write ends without
 * having verified that nobody wrote after it. A manifest of this write's own
 * gets its missing chunks again; another writer's that is missing chunks
 * (one that can't be read at all) is pointed back at this write's cache.
 * False only when the gist disappeared.
 */
const ensureReadableManifest = async (
  gistId: string,
  plan: CacheWritePlan,
  generation: string,
  warn?: (message: string) => void
) => {
  // This write went through: a failure here (e.g. still rate limited) only
  // means the gist can't be checked now.
  const meta = await fetchGistMeta(gistId).catch((error) => {
    console.warn('Could not check the cache gist after writing.', error);
    return null;
  });
  if (!meta || meta.filesTruncated || !meta.manifest) return true;
  const present = new Set(meta.files);
  if (meta.manifest.chunks.every((ref) => present.has(ref.file))) return true;

  const files: GistFiles = Object.fromEntries(
    plan.chunks
      .filter(({ file }) => !present.has(file))
      .map(({ file, content }) => [file, { content }])
  );
  const repointed = meta.manifest.generation !== generation;
  console.warn(
    repointed
      ? 'Pointing the cache gist back at this write: the current manifest is missing chunks.'
      : 'Uploading cache chunks deleted after the write again.'
  );
  try {
    // Chunks first, then (to point the gist back at them) the manifest.
    for (const batch of batchFiles(files)) {
      if (!(await patchGist(gistId, { files: batch }))) return false;
    }
    if (repointed) {
      const response = await patchGist(gistId, {
        files: { [GIST_FILENAME]: { content: plan.manifest } },
      });
      if (!response) return false;
      warn?.(
        'Your cache on GitHub had been left incomplete by another device and was restored from this one.'
      );
    }
  } catch (error) {
    console.warn('Could not repair the cache gist after writing.', error);
  }
  return true;
};

/**
 * Writes `data` to `gistId` (or a new gist when null). Null when the gist no
 * longer exists.
 *
 * Optimistic concurrency, since the Gist API has no conditional writes
 * (GitHub ignores preconditions on PATCH):
 *
 * 1. Before writing, the gist's current manifest is checked. When it isn't
 *    the cache this session last read or wrote — another device or tab wrote
 *    since, or this session never read it (no base) — the current cache is
 *    read and merged in first (see mergeCacheData; without a base the merge
 *    only ever keeps things). A gist without a cache needs no read, and
 *    `known` (a cache discovery just read) saves one when it is still
 *    current. A read that fails abandons the write (see readCacheToMerge).
 * 2. After writing, the revisions made since the check are listed. If
 *    another writer completed a cache in between (its write landed between
 *    the check and this write's manifest, and this write replaced it), that
 *    revision is read back from the gist history, merged in, and written
 *    again — at most MAX_REPAIR_ROUNDS times, so two writers can't keep
 *    rewriting each other. The last write is checked the same way: if
 *    another writer is still found (or the check can't be made), the user
 *    is warned when it matters, and the gist's current manifest is made
 *    readable (see ensureReadableManifest).
 *
 * The revisions "since the check" start at the revision the check (or the
 * read) returned. Without `history` in responses (deprecated), the newest
 * commit is listed first and the check made after it, so no write can land
 * between the two unobserved.
 *
 * A new gist (`gistId` null) skips both: nobody else can have written it.
 */
const writeCacheTo = async (
  gistId: string | null,
  data: CachedData,
  description: string,
  onMerged?: (merged: CachedData) => boolean,
  known?: CacheGist | null,
  warn?: (message: string) => void
): Promise<CacheGist | null> => {
  if (!gistId) {
    const generation = newGeneration();
    const created = await writeShardedCache(
      null,
      { description, ...buildShardedCache(data, generation) },
      [],
      () => []
    );
    if (!created) return null;
    cacheBases.set(
      created.gist.id,
      toCacheBase(
        { version: created.gist.revision?.version ?? null, generation },
        data
      )
    );
    return created.gist;
  }

  let meta = await fetchGistMeta(gistId);
  if (!meta) return null;
  // Where verification starts when no response carries a history version:
  // the newest commit, listed before the check it anchors.
  let anchor: string | null = null;
  if (!meta.revision.version) {
    // A few, in case GitHub ever lists them oldest first within a page.
    const versions = await listGistVersions(gistId, ANCHOR_COMMITS);
    if (!versions) {
      // Without it, a write landing meanwhile would go unnoticed.
      throw new Error(
        'Could not list the cache gist revisions to check for other writers.'
      );
    }
    anchor = versions[0] ?? null;
    meta = await fetchGistMeta(gistId);
    if (!meta) return null;
  }
  if (meta.filesTruncated) {
    console.warn(
      'The cache gist has more files than GitHub lists; stale chunk files are deleted as they show up.'
    );
  }

  const base = cacheBases.get(gistId) ?? null;
  let toWrite = data;
  let merged = false;
  // The cache the gist held when this write checked (or read it to merge),
  // what that held, and its files.
  let checked: {
    revision: GistRevision;
    base: CacheBase | null;
    files: string[];
  } = { revision: meta.revision, base, files: meta.files };

  if (!base || !isSameRevision(meta.revision, base.revision)) {
    let remote: RemoteCache | null = null;
    if (meta.files.includes(GIST_FILENAME) || meta.filesTruncated) {
      const knownData = known ? parseCache(known) : null;
      remote =
        known &&
        knownData &&
        known.id === gistId &&
        isSameRevision(known.revision, meta.revision)
          ? // Still the cache discovery read: the check describes it.
            {
              gist: {
                ...known,
                revision: meta.revision,
                files: meta.files.map((name) => ({ name })),
              },
              data: knownData,
            }
          : await readCacheToMerge(gistId, warn);
    }
    if (remote?.data) {
      toWrite = mergeCacheData(base, remote.data, toWrite);
      merged = true;
      // The read may be newer than the check: it is what was merged.
      const revision = remote.gist.revision ?? meta.revision;
      checked = {
        revision,
        base: toCacheBase(revision, remote.data),
        files: remote.gist.files.map((file) => file.name),
      };
    } else {
      // No cache, or one with nothing a merge could keep (see
      // readCacheToMerge): written over.
      checked = remote
        ? {
            revision: remote.gist.revision ?? meta.revision,
            base: null,
            files: remote.gist.files.map((file) => file.name),
          }
        : { revision: meta.revision, base: null, files: meta.files };
    }
  }

  // Bases for merging another writer's cache, by the generation it was based
  // on: the one this write checked, and each one this write produces.
  const basesByGeneration = new Map<string, CacheBase | null>();
  if (checked.revision.generation) {
    basesByGeneration.set(checked.revision.generation, checked.base);
  }
  const knownGenerations = new Set(basesByGeneration.keys());
  // Generations whose chunks this write may delete (see staleChunkFiles).
  const superseded = new Set([
    ...knownGenerations,
    ...(abandonedGenerations.get(gistId) ?? []),
  ]);
  const ownVersions = new Set<string>();
  const probed = new Set<string>();
  let requests = 0;
  const since = checked.revision.version ?? anchor ?? meta.revision.version;

  let parent = checked.revision.generation;
  let listing = checked.files;
  let written: ShardedWriteResult;
  let generation: string;
  let plan: CacheWritePlan;
  let outcome: InterleavedCheck['kind'] = 'none';
  for (let round = 0; ; round++) {
    const roundGeneration = newGeneration();
    generation = roundGeneration;
    const roundPlan: CacheWritePlan = {
      description,
      ...buildShardedCache(toWrite, roundGeneration, parent),
    };
    plan = roundPlan;
    const keep = new Set(roundPlan.chunks.map(({ file }) => file));
    let result: ShardedWriteResult | null;
    try {
      result = await writeShardedCache(gistId, roundPlan, listing, (from) =>
        staleChunkFiles(from, keep, superseded, Date.now())
      );
    } catch (error) {
      // Some of its chunks may have landed; no manifest will name them.
      const abandoned = abandonedGenerations.get(gistId) ?? new Set();
      abandoned.add(roundGeneration);
      abandonedGenerations.set(gistId, abandoned);
      throw error;
    }
    if (!result) return null;
    if (round === 0) abandonedGenerations.delete(gistId);
    written = result;
    requests += result.requests;
    result.ownVersions.forEach((version) => ownVersions.add(version));
    knownGenerations.add(roundGeneration);
    basesByGeneration.set(
      roundGeneration,
      toCacheBase({ version: null, generation: roundGeneration }, toWrite)
    );

    if (!since) break;
    const check = await findInterleavedWrite({
      gistId,
      since,
      result,
      ownVersions,
      requests,
      knownGenerations,
      probed,
    });
    outcome = check.kind;
    if (check.kind !== 'found') break;
    if (round === MAX_REPAIR_ROUNDS) break;

    // Another writer's cache landed in between and this write replaced it:
    // merge it in (against what it was based on, when that is known) and
    // write again. Its chunks and this round's are replaced by the next.
    knownGenerations.add(check.generation);
    superseded.add(check.generation);
    superseded.add(roundGeneration);
    const interleavedBase = check.parent
      ? (basesByGeneration.get(check.parent) ?? null)
      : null;
    toWrite = mergeCacheData(interleavedBase, check.data, toWrite);
    merged = true;
    parent = roundGeneration;
    listing = result.files;
  }

  if (outcome !== 'none') {
    // The last write isn't known to be the last one: another writer's cache
    // is still being replaced (its device merges this one back in on its
    // next write), or the revisions couldn't be checked.
    if (outcome === 'found') {
      warn?.(
        'Your cache was saved while another device or tab kept saving it too. Changes made there may not show here until it saves again.'
      );
    }
    const exists = await ensureReadableManifest(gistId, plan, generation, warn);
    if (!exists) return null;
  }

  // The base must be what the caller's state holds (see onMerged).
  const adopted = !merged || onMerged?.(toWrite) === true;
  if (adopted) {
    cacheBases.set(
      gistId,
      toCacheBase(
        { version: written!.gist.revision?.version ?? null, generation },
        toWrite
      )
    );
  } else {
    cacheBases.delete(gistId);
  }
  return written!.gist;
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

  const description = buildCacheDescription(normalizedOwnerLogin);
  const writeTo = (targetId: string | null, known?: CacheGist | null) =>
    writeCacheTo(
      targetId,
      normalizedData,
      description,
      options.onMerged,
      known,
      options.onWarning
    );

  const updateTargets = new Set<string>();
  if (gistId) {
    updateTargets.add(gistId);
  }

  for (const targetId of updateTargets) {
    const updatedGist = await writeTo(targetId);
    if (updatedGist) {
      return updatedGist;
    }
  }

  if (options.discoverCanonicalFallback) {
    const discoveryResult = await findCanonicalCacheGist({
      ownerLogin: normalizedOwnerLogin,
      preferredGistId: gistId,
      fullScan: true,
      failOnReadError: true,
    });

    const canonicalGistId = discoveryResult.canonicalGist?.id;
    if (canonicalGistId && !updateTargets.has(canonicalGistId)) {
      // Discovery just read it: merged with without reading it again, unless
      // it changed since.
      const updatedGist = await writeTo(
        canonicalGistId,
        discoveryResult.canonicalGist
      );
      if (updatedGist) {
        return updatedGist;
      }
    }
  }

  const createdGist = await writeTo(null);
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
