import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GIST_CHUNK_PREFIX,
  GIST_FILENAME,
  MAX_GIST_WRITE_BYTES,
  MAX_PROXY_BODY_BYTES,
} from '@/lib/constants';

vi.mock('@/lib/ghRest', () => ({
  ghRest: vi.fn(),
  ghRestOk: vi.fn(),
  ghGistRaw: vi.fn(),
  GitHubRestError: class extends Error {
    status: number;
    constructor(status: number) {
      super(`GitHub request failed (${status})`);
      this.status = status;
    }
  },
}));

import { GitHubRestError, ghGistRaw, ghRest } from '@/lib/ghRest';
import {
  buildCacheDescription,
  buildShardedCache,
  findCanonicalCacheGist,
  CacheUnreadableError,
  ORPHAN_CHUNK_MAX_AGE_MS,
  forgetCacheBases,
  newGeneration,
  parseCache,
  rememberCacheBase,
  serializeCache,
  writeCache,
} from '@/lib/gist';
import { decodeCache, encodeCache } from '@/lib/cacheCodec';
import { toUserMessage } from '@/lib/errors';
import type { CacheGist, CachedData, NetworkUser } from '@/lib/types';

const OWNER = 'octocat';
const GITHUB_INLINE_LIMIT = 1_000_000;

const user = (i: number): NetworkUser => ({
  __typename: 'User',
  id: `MDQ6VXNlcjE${i}`,
  login: `user-${i}`,
  name: i % 3 ? `Name "${i}"` : null,
  avatarUrl: `https://avatars.githubusercontent.com/u/${1000 + i}?v=4`,
  url: `https://github.com/user-${i}`,
  followers: { totalCount: i % 97 },
  following: { totalCount: i % 89 },
  accountType: 'user',
});

const cache = (followers: number, following = 10): CachedData => ({
  network: {
    followers: Array.from({ length: followers }, (_, i) => user(i)),
    following: Array.from({ length: following }, (_, i) => user(i + 1e6)),
  },
  ghosts: [],
  removedGhosts: [],
  ignoredLogins: ['someone'],
  lastDiff: null,
  settings: {
    showAvatars: true,
    paginationPageSize: 100,
    customStaleTime: null,
  },
  timestamp: 1_700_000_000_000,
  syncedAt: 1_700_000_000_000,
  metadata: {
    totalConnections: followers + following,
    fetchDuration: 1,
    cacheVersion: '4.0',
    ownerLogin: OWNER,
    cacheKey: `follow-sync:${OWNER}:network-cache`,
  },
});

let nextVersion = 1;
/** A unique 40-hex revision SHA, like gist history versions. */
const sha = () => (nextVersion++).toString(16).padStart(40, '0');

/** What the proxy keeps of a cache manifest in a file-list (`meta`) view. */
const META_MANIFEST_CHARS = 64_000;
/** History entries the proxy keeps. */
const PROXY_HISTORY = 30;

type Request = {
  method: string;
  path: string;
  files: string[];
  /** The proxy view asked for (`meta`), if any. */
  view: string | null;
};

const restError = (status: number) =>
  new (GitHubRestError as unknown as new (status: number) => Error)(status);

/** GitHub's cap on the files a single-gist response lists. */
const GITHUB_FILE_LIST_LIMIT = 300;

/**
 * An in-memory stand-in for the Gist API behind the proxy. Every change makes
 * a revision (with a SHA version and a commit time) and the gist keeps its
 * history, like GitHub: `GET /gists/{id}/{sha}` and raw URLs read a revision
 * as it was, and `GET /gists/{id}/commits` lists them. PATCH merges files
 * (null deletes), inline content is cut at 1 MB like GitHub does, the
 * proxy's `meta` view and history trimming are applied, and request bodies
 * over the host limit are refused like Vercel does.
 *
 * Options:
 * - `history` / `historyOnWrite` false leave the (deprecated) history out of
 *   every response / of write responses;
 * - `order: 'oldest-first'` lists history and commits oldest first (GitHub
 *   lists them newest first, but doesn't promise it);
 * - `deleteAbsent: '422'` refuses (422) a PATCH that deletes a file the gist
 *   doesn't have, instead of ignoring the deletion;
 * - `fileListLimit`: a gist response lists at most this many files (sorted
 *   by name) and sets `truncated`, like GitHub's 300-file cap.
 *
 * `failRead` / `failRaw` make a request fail with a status (e.g. a rate
 * limit or a 5xx) without touching the gist.
 */
const fakeGitHub = ({
  history = true,
  historyOnWrite = true,
  order = 'newest-first' as 'newest-first' | 'oldest-first',
  deleteAbsent = 'ignore' as 'ignore' | '422',
  fileListLimit = GITHUB_FILE_LIST_LIMIT,
} = {}) => {
  type Revision = {
    version: string;
    committedAt: string;
    files: Map<string, string>;
  };
  const gists = new Map<
    string,
    { description: string; files: Map<string, string>; revisions: Revision[] }
  >();
  const bodies: number[] = [];
  let nextId = 1;
  let commitCount = 0;
  let failWhen: ((method: string, files: string[]) => boolean) | null = null;
  let failRead: ((request: Request) => number | null) | null = null;
  let failRaw: ((file: string) => number | null) | null = null;
  let beforeRequest: ((request: Request) => void) | null = null;

  const commit = (id: string) => {
    const gist = gists.get(id)!;
    gist.revisions.push({
      version: sha(),
      // One second apart, like GitHub's committed_at resolution.
      committedAt: new Date(
        Date.UTC(2024, 0, 1) + ++commitCount * 1000
      ).toISOString(),
      files: new Map(gist.files),
    });
  };

  const ordered = <T>(newestFirst: T[]) =>
    order === 'newest-first' ? newestFirst : [...newestFirst].reverse();

  const view = (
    id: string,
    {
      omitContent = false,
      withHistory = true,
      version,
    }: { omitContent?: boolean; withHistory?: boolean; version?: string } = {}
  ) => {
    const gist = gists.get(id)!;
    const upTo = version
      ? gist.revisions.findIndex((revision) => revision.version === version)
      : gist.revisions.length - 1;
    if (upTo < 0) return null;
    const revision = gist.revisions[upTo];
    const names = [...revision.files.keys()].sort();
    const listed = names.slice(0, fileListLimit);
    return {
      id,
      description: gist.description,
      public: false,
      updated_at: '2024-01-01T00:00:00Z',
      ...(history && withHistory
        ? {
            history: ordered(
              gist.revisions
                .slice(0, upTo + 1)
                .reverse()
                .slice(0, PROXY_HISTORY)
                .map(({ version, committedAt }) => ({
                  version,
                  committed_at: committedAt,
                }))
            ),
          }
        : {}),
      owner: { login: OWNER },
      ...(listed.length < names.length ? { truncated: true } : {}),
      files: Object.fromEntries(
        listed.map((name) => {
          const content = revision.files.get(name)!;
          const keepManifest =
            name === GIST_FILENAME && content.length <= META_MANIFEST_CHARS;
          const dropped = omitContent && !keepManifest;
          return [
            name,
            {
              filename: name,
              content: dropped ? null : content.slice(0, GITHUB_INLINE_LIMIT),
              truncated: dropped || content.length > GITHUB_INLINE_LIMIT,
              raw_url: `https://gist.githubusercontent.com/${OWNER}/${id}/raw/${revision.version}/${encodeURIComponent(name)}`,
            },
          ];
        })
      ),
    };
  };

  vi.mocked(ghRest).mockImplementation(async (path, init) => {
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const requestView = headers.get('x-follow-sync-gist-view');
    if (path.startsWith('/gists?')) {
      const status = failRead?.({ method, path, files: [], view: null });
      if (status) throw restError(status);
      return [...gists.keys()].map((id) =>
        view(id, { omitContent: true })
      ) as never;
    }
    let body: {
      description?: string;
      files?: Record<string, { content: string } | null>;
    } = {};
    if (typeof init?.body === 'string') {
      bodies.push(init.body.length);
      if (init.body.length > MAX_PROXY_BODY_BYTES) {
        throw new Error(
          'GitHub request failed (413): FUNCTION_PAYLOAD_TOO_LARGE'
        );
      }
      body = JSON.parse(init.body);
    }
    const files = Object.keys(body.files ?? {});
    const request = { method, path, files, view: requestView };
    beforeRequest?.(request);
    if (failWhen?.(method, files)) {
      throw new Error('GitHub request failed (502): network');
    }
    if (method === 'GET') {
      const status = failRead?.(request);
      if (status) throw restError(status);
    }

    if (path === '/gists' && method === 'POST') {
      const id = `g${nextId++}`;
      gists.set(id, {
        description: body.description ?? '',
        files: new Map(),
        revisions: [],
      });
      for (const [name, file] of Object.entries(body.files ?? {})) {
        if (file) gists.get(id)!.files.set(name, file.content);
      }
      commit(id);
      return view(id, { withHistory: historyOnWrite }) as never;
    }

    const [, , id, sub] = path.split('?')[0].split('/');
    const gist = gists.get(id);
    if (!gist) return null;
    const omitContent = requestView === 'meta';

    if (sub === 'commits') {
      const perPage = Number(/per_page=(\d+)/.exec(path)?.[1] ?? 30);
      const newestFirst = [...gist.revisions]
        .reverse()
        .map(({ version, committedAt }) => ({
          version,
          committed_at: committedAt,
        }));
      // A page is always the newest ones; only their order varies.
      return ordered(newestFirst.slice(0, perPage)) as never;
    }
    if (sub) {
      return view(id, { omitContent, version: sub }) as never;
    }

    if (method === 'PATCH') {
      const deletions = Object.entries(body.files ?? {})
        .filter(([, file]) => !file)
        .map(([name]) => name);
      if (
        deleteAbsent === '422' &&
        deletions.some((name) => !gist.files.has(name))
      ) {
        throw restError(422);
      }
      if (body.description) gist.description = body.description;
      for (const [name, file] of Object.entries(body.files ?? {})) {
        if (file) gist.files.set(name, file.content);
        else gist.files.delete(name);
      }
      commit(id);
    }
    return view(id, {
      omitContent,
      withHistory: method === 'GET' || historyOnWrite,
    }) as never;
  });

  vi.mocked(ghGistRaw).mockImplementation(async (rawUrl) => {
    const [, id, version, name] =
      /\/([^/]+)\/raw\/([^/]+)\/([^/]+)$/.exec(rawUrl) ?? [];
    const status = failRaw?.(decodeURIComponent(name ?? ''));
    if (status) throw restError(status);
    const content = gists
      .get(id)
      ?.revisions.find((revision) => revision.version === version)
      ?.files.get(decodeURIComponent(name));
    if (content === undefined) throw restError(404);
    return content;
  });

  const currentManifest = (id: string) => {
    const manifest = gists.get(id)!.files.get(GIST_FILENAME);
    try {
      return JSON.parse(manifest ?? '') as {
        generation?: string;
        chunks?: Array<{ file: string }>;
      };
    } catch {
      return undefined;
    }
  };

  return {
    gists,
    bodies,
    /**
     * Another device writes `data` to the gist in one request, as this code
     * does: based on the cache it holds now, deleting the chunks of the
     * manifest it replaces. `sweep: 'all'` deletes every other chunk file
     * instead, like earlier versions of this code did (including another
     * writer's chunks still uploading).
     */
    writeElsewhere: (
      id: string,
      data: CachedData,
      { sweep = 'replaced' }: { sweep?: 'replaced' | 'all' } = {}
    ) => {
      const gist = gists.get(id)!;
      const replaced = currentManifest(id);
      const { manifest, chunks } = buildShardedCache(
        data,
        newGeneration(),
        replaced?.generation ?? null
      );
      const replacedChunks = new Set(
        (replaced?.chunks ?? []).map((ref) => ref.file)
      );
      gist.files = new Map([
        ...[...gist.files].filter(
          ([name]) =>
            name !== GIST_FILENAME &&
            !(sweep === 'all'
              ? name.startsWith(GIST_CHUNK_PREFIX)
              : replacedChunks.has(name))
        ),
        [GIST_FILENAME, manifest],
        ...chunks.map(
          ({ file, content }) => [file, content] as [string, string]
        ),
      ]);
      commit(id);
    },
    /**
     * Another device's write of `data`, in two steps like a multi-request
     * write: its chunks now, its manifest (deleting the chunks of the
     * manifest it then replaces) when `finish` is called.
     */
    startWriteElsewhere: (id: string, data: CachedData) => {
      const generation = newGeneration();
      const { manifest, chunks } = buildShardedCache(
        data,
        generation,
        currentManifest(id)?.generation ?? null
      );
      const gist = gists.get(id)!;
      for (const { file, content } of chunks) gist.files.set(file, content);
      commit(id);
      return {
        chunks: chunks.map(({ file }) => file),
        finish: () => {
          for (const ref of currentManifest(id)?.chunks ?? []) {
            gist.files.delete(ref.file);
          }
          gist.files.set(GIST_FILENAME, manifest);
          commit(id);
        },
      };
    },
    /** Another device uploads a chunk file without its manifest (yet). */
    uploadChunkElsewhere: (id: string) => {
      const name = `${GIST_CHUNK_PREFIX}${newGeneration()}.1`;
      gists.get(id)!.files.set(name, '{');
      commit(id);
      return name;
    },
    /** Puts a gist with exactly `files` in place (one revision). */
    seed: (id: string, files: Record<string, string>) => {
      gists.set(id, {
        description: buildCacheDescription(OWNER),
        files: new Map(Object.entries(files)),
        revisions: [],
      });
      commit(id);
    },
    /** Changes the gist's files directly (one revision); null deletes. */
    edit: (id: string, files: Record<string, string | null>) => {
      const gist = gists.get(id)!;
      for (const [name, content] of Object.entries(files)) {
        if (content === null) gist.files.delete(name);
        else gist.files.set(name, content);
      }
      commit(id);
    },
    failWhen: (fn: typeof failWhen) => {
      failWhen = fn;
    },
    failRead: (fn: typeof failRead) => {
      failRead = fn;
    },
    failRaw: (fn: typeof failRaw) => {
      failRaw = fn;
    },
    beforeRequest: (fn: typeof beforeRequest) => {
      beforeRequest = fn;
    },
    fileNames: (id: string) => [...gists.get(id)!.files.keys()].sort(),
    /** The cache the gist holds now, as any reader would parse it. */
    liveData: (id: string) =>
      parseCache({
        id,
        files: [...gists.get(id)!.files].map(([name, text]) => ({
          name,
          text,
        })),
      }),
    /** The live manifest's chunk files missing from the gist. */
    missingChunks: (id: string) =>
      (currentManifest(id)?.chunks ?? [])
        .map((ref) => ref.file)
        .filter((file) => !gists.get(id)!.files.has(file)),
  };
};

const readBack = async (gistId: string) => {
  const { canonicalGist } = await findCanonicalCacheGist({
    ownerLogin: OWNER,
    preferredGistId: gistId,
  });
  return canonicalGist ? parseCache(canonicalGist) : null;
};

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  forgetCacheBases();
});

describe('sharded cache', () => {
  it('round-trips a small network through one write request', async () => {
    const github = fakeGitHub();
    const data = cache(50);

    const gist = await writeCache(data, null);

    expect(github.bodies).toHaveLength(1);
    const names = github.fileNames(gist.id);
    expect(names).toHaveLength(2);
    expect(names).toContain(GIST_FILENAME);
    expect(names.some((name) => name.startsWith(GIST_CHUNK_PREFIX))).toBe(true);
    expect(await readBack(gist.id)).toEqual(data);
  });

  it('splits a large network so no request or chunk exceeds the host limit', async () => {
    const github = fakeGitHub();
    const data = cache(60_000, 5_000);

    const gist = await writeCache(data, null);

    expect(github.bodies.length).toBeGreaterThan(1);
    for (const size of github.bodies) {
      expect(size).toBeLessThanOrEqual(MAX_GIST_WRITE_BYTES);
    }
    const chunks = github
      .fileNames(gist.id)
      .filter((name) => name.startsWith(GIST_CHUNK_PREFIX));
    expect(chunks.length).toBeGreaterThan(3);
    for (const name of chunks) {
      expect(
        github.gists.get(gist.id)!.files.get(name)!.length
      ).toBeLessThanOrEqual(GITHUB_INLINE_LIMIT);
    }

    expect(await readBack(gist.id)).toEqual(data);
  });

  it('replaces the previous chunks on rewrite and removes them', async () => {
    const github = fakeGitHub();
    const first = await writeCache(cache(100), null);
    const before = github.fileNames(first.id);

    const next = { ...cache(120), timestamp: 2 };
    await writeCache(next, first.id);

    const after = github.fileNames(first.id);
    expect(after).toHaveLength(2);
    expect(after.filter((name) => before.includes(name))).toEqual([
      GIST_FILENAME,
    ]);
    expect(await readBack(first.id)).toEqual(next);
  });

  it('keeps serving the previous cache when a multi-request write fails half-way, and cleans up after', async () => {
    const github = fakeGitHub();
    const original = cache(60_000, 5_000);
    const gist = await writeCache(original, null);

    // The second chunk batch of the next write fails: the manifest is never
    // written, so the old one (and its chunks) stay authoritative.
    let patches = 0;
    github.failWhen(
      (method, files) =>
        method === 'PATCH' && !files.includes(GIST_FILENAME) && ++patches === 2
    );
    const updated = { ...cache(60_000, 5_001), timestamp: 2 };
    await expect(writeCache(updated, gist.id)).rejects.toThrow('(502)');
    const orphans = github.fileNames(gist.id).length;
    expect(await readBack(gist.id)).toEqual(original);

    // The next write succeeds and removes the orphaned chunks.
    github.failWhen(null);
    await writeCache(updated, gist.id);
    expect(github.fileNames(gist.id).length).toBeLessThan(orphans);
    const manifest = JSON.parse(
      github.gists.get(gist.id)!.files.get(GIST_FILENAME)!
    );
    expect(github.fileNames(gist.id)).toEqual(
      [
        GIST_FILENAME,
        ...manifest.chunks.map((ref: { file: string }) => ref.file),
      ].sort()
    );
    expect(await readBack(gist.id)).toEqual(updated);
  });

  it('rejects chunks that do not match the manifest', () => {
    const data = cache(10);
    const { manifest, chunks } = buildShardedCache(data, 'gen1');
    const gist = (text: string): CacheGist => ({
      id: 'x',
      files: [
        { name: GIST_FILENAME, text: manifest },
        { name: chunks[0].file, text },
      ],
    });

    expect(parseCache(gist(chunks[0].content))).toEqual(data);
    expect(parseCache(gist(chunks[0].content.slice(1)))).toBeNull();
    expect(
      parseCache({ id: 'x', files: [{ name: GIST_FILENAME, text: manifest }] })
    ).toBeNull();
  });

  it('reads chunks the proxy or GitHub returned without content via raw_url', async () => {
    const github = fakeGitHub();
    const data = cache(200);
    const gist = await writeCache(data, null);
    // Serve this gist with every content dropped, as the proxy does when the
    // response would exceed its budget.
    const real = vi.mocked(ghRest).getMockImplementation()!;
    vi.mocked(ghRest).mockImplementation(async (path, init) => {
      const result = (await real(path, init)) as {
        files?: Record<string, { content: string | null; truncated: boolean }>;
      } | null;
      if (path.startsWith('/gists/') && result?.files) {
        for (const file of Object.values(result.files)) {
          file.content = null;
          file.truncated = true;
        }
      }
      return result as never;
    });

    expect(await readBack(gist.id)).toEqual(data);
    expect(vi.mocked(ghGistRaw)).toHaveBeenCalledTimes(2);
    expect(github.fileNames(gist.id)).toHaveLength(2);
  });

  it('writes a manifest that pre-sharding code reads as an outdated cache, not a network', () => {
    const { manifest } = buildShardedCache(cache(10), 'gen1');
    const parsed = JSON.parse(manifest);

    expect(parsed.metadata.cacheVersion).toBe('4.0');
    expect(parsed.network).toBeUndefined();
    // The compact-1 reader rejects it as a cache rather than misreading it.
    expect(decodeCache(parsed)).toBeNull();
  });
});

describe('single-file caches from before sharding', () => {
  const singleFileGist = (content: string): CacheGist => ({
    id: 'legacy',
    description: buildCacheDescription(OWNER),
    files: [{ name: GIST_FILENAME, text: content }],
  });

  it('reads a compact-1 cache written under 3.0', () => {
    const data = {
      ...cache(5),
      metadata: { ...cache(5).metadata, cacheVersion: '3.0' },
    };
    expect(
      parseCache(singleFileGist(serializeCache(encodeCache(data))))
    ).toEqual(data);
  });

  it('reads a legacy object cache written under 3.0', () => {
    const data = {
      ...cache(5),
      metadata: { ...cache(5).metadata, cacheVersion: '3.0' },
    };
    expect(parseCache(singleFileGist(JSON.stringify(data)))).toEqual(data);
  });

  it('turns a single-file cache into a sharded one on the next write', async () => {
    const github = fakeGitHub();
    github.seed('legacy', {
      [GIST_FILENAME]: serializeCache(encodeCache(cache(5))),
    });

    await writeCache(cache(6), 'legacy');

    expect(github.fileNames('legacy')).toHaveLength(2);
    expect(await readBack('legacy')).toEqual(cache(6));
  });

  it('keeps a single-file cache too large to relay as the cache to rewrite', async () => {
    const github = fakeGitHub();
    const huge = 'x'.repeat(GITHUB_INLINE_LIMIT + 1);
    github.seed('legacy', { [GIST_FILENAME]: huge });
    vi.mocked(ghGistRaw).mockRejectedValue(
      new (GitHubRestError as unknown as new (status: number) => Error)(413)
    );

    const { canonicalGist } = await findCanonicalCacheGist({
      ownerLogin: OWNER,
    });

    expect(canonicalGist?.id).toBe('legacy');
    expect(parseCache(canonicalGist!)).toBeNull();
  });
});

describe('concurrent writers (optimistic concurrency)', () => {
  const withIgnored = (data: CachedData, ignoredLogins: string[]) => ({
    ...data,
    ignoredLogins,
  });

  const requests = () =>
    vi.mocked(ghRest).mock.calls.map(([path, init]) => {
      const view = new Headers(init?.headers).get('x-follow-sync-gist-view');
      return `${init?.method ?? 'GET'}${view ? `(${view})` : ''} ${path}`;
    });

  it('merges in what another device wrote since this session read the cache', async () => {
    const github = fakeGitHub();
    const base = withIgnored(cache(20), ['old']);
    const gist = await writeCache(base, null);

    // Another device ignores "theirs"; this session then ignores "mine".
    github.writeElsewhere(gist.id, withIgnored(base, ['old', 'theirs']));
    vi.mocked(ghRest).mockClear();
    const onMerged = vi.fn();
    await writeCache(
      { ...withIgnored(base, ['old', 'mine']), timestamp: 5 },
      gist.id,
      { onMerged }
    );

    const stored = await readBack(gist.id);
    expect([...(stored?.ignoredLogins ?? [])].sort()).toEqual([
      'mine',
      'old',
      'theirs',
    ]);
    expect(onMerged).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoredLogins: expect.arrayContaining(['theirs', 'mine']),
      })
    );
  });

  it('checks the revision once and writes straight away when nothing changed', async () => {
    fakeGitHub();
    const gist = await writeCache(cache(20), null);
    vi.mocked(ghRest).mockClear();
    const onMerged = vi.fn();

    await writeCache({ ...cache(21), timestamp: 5 }, gist.id, { onMerged });

    expect(requests()).toEqual([
      `GET(meta) /gists/${gist.id}`,
      `PATCH /gists/${gist.id}`,
    ]);
    expect(onMerged).not.toHaveBeenCalled();
  });

  it('does not mistake its own write for a newer one when a write response has no history', async () => {
    fakeGitHub({ historyOnWrite: false });
    const gist = await writeCache(cache(20), null);
    await writeCache({ ...cache(21), timestamp: 5 }, gist.id);
    vi.mocked(ghRest).mockClear();
    const onMerged = vi.fn();

    await writeCache({ ...cache(22), timestamp: 6 }, gist.id, { onMerged });

    // The revisions since the check come from the commit list instead.
    expect(requests()).toEqual([
      `GET(meta) /gists/${gist.id}`,
      `PATCH /gists/${gist.id}`,
      `GET /gists/${gist.id}/commits?per_page=100`,
    ]);
    expect(onMerged).not.toHaveBeenCalled();
  });

  it('merges against the revision a read recorded', async () => {
    const github = fakeGitHub();
    const gist = await writeCache(withIgnored(cache(20), []), null);
    forgetCacheBases();

    // This session loads the cache, then another device writes.
    const { canonicalGist } = await findCanonicalCacheGist({
      ownerLogin: OWNER,
      preferredGistId: gist.id,
    });
    rememberCacheBase(canonicalGist!, parseCache(canonicalGist!)!);
    github.writeElsewhere(gist.id, withIgnored(cache(20), ['theirs']));

    await writeCache(withIgnored(cache(20), ['mine']), gist.id);

    expect(
      [...((await readBack(gist.id))?.ignoredLogins ?? [])].sort()
    ).toEqual(['mine', 'theirs']);
  });

  describe('a session that never read the gist (no base)', () => {
    it('merges in what is there instead of overwriting it', async () => {
      const github = fakeGitHub();
      const gist = await writeCache(withIgnored(cache(20), []), null);
      // E.g. a forced refresh straight after page load: nothing was read.
      forgetCacheBases();
      github.writeElsewhere(gist.id, withIgnored(cache(20), ['theirs']));
      const onMerged = vi.fn();

      await writeCache(
        { ...withIgnored(cache(20), ['mine']), timestamp: 5 },
        gist.id,
        { onMerged }
      );

      expect(
        [...((await readBack(gist.id))?.ignoredLogins ?? [])].sort()
      ).toEqual(['mine', 'theirs']);
      expect(onMerged).toHaveBeenCalledWith(
        expect.objectContaining({
          ignoredLogins: expect.arrayContaining(['mine', 'theirs']),
        })
      );
    });

    it('keeps the network of the newer sync', async () => {
      const github = fakeGitHub();
      const gist = await writeCache(cache(20), null);
      forgetCacheBases();
      const newer = { ...cache(30), syncedAt: 1_800_000_000_000 };
      github.writeElsewhere(gist.id, newer);

      await writeCache({ ...cache(25), timestamp: 5 }, gist.id);

      expect((await readBack(gist.id))?.network).toEqual(newer.network);
    });

    it('writes straight away when the gist holds no cache', async () => {
      const github = fakeGitHub();
      github.seed('empty', { 'notes.txt': 'hello' });
      vi.mocked(ghRest).mockClear();

      await writeCache(cache(20), 'empty');

      expect(requests()).toEqual([
        'GET(meta) /gists/empty',
        'PATCH /gists/empty',
      ]);
      expect(await readBack('empty')).toEqual(cache(20));
    });

    it('does not read again a cache that discovery just read', async () => {
      const github = fakeGitHub();
      const gist = await writeCache(withIgnored(cache(20), []), null);
      forgetCacheBases();
      github.writeElsewhere(gist.id, withIgnored(cache(20), ['theirs']));
      vi.mocked(ghRest).mockClear();

      await writeCache(withIgnored(cache(20), ['mine']), null, {
        discoverCanonicalFallback: true,
      });

      expect(requests().filter((r) => r === `GET /gists/${gist.id}`)).toEqual([
        `GET /gists/${gist.id}`,
      ]);
      expect(
        [...((await readBack(gist.id))?.ignoredLogins ?? [])].sort()
      ).toEqual(['mine', 'theirs']);
    });
  });

  describe('a write landing between the check and this write', () => {
    /** Another device writes right before this session's next PATCH. */
    const interleaveOnce = (
      github: ReturnType<typeof fakeGitHub>,
      id: string,
      data: CachedData,
      when: (request: { method: string; files: string[] }) => boolean = ({
        method,
      }) => method === 'PATCH'
    ) => {
      let done = false;
      github.beforeRequest((request) => {
        if (done || !when(request)) return;
        done = true;
        github.writeElsewhere(id, data);
      });
    };

    it('reads the replaced cache back from the gist history and merges it in', async () => {
      const github = fakeGitHub();
      const base = withIgnored(cache(20), ['old']);
      const gist = await writeCache(base, null);
      interleaveOnce(github, gist.id, withIgnored(base, ['old', 'theirs']));
      vi.mocked(ghRest).mockClear();
      const onMerged = vi.fn();

      await writeCache(
        { ...withIgnored(base, ['old', 'mine']), timestamp: 5 },
        gist.id,
        { onMerged }
      );

      expect(
        [...((await readBack(gist.id))?.ignoredLogins ?? [])].sort()
      ).toEqual(['mine', 'old', 'theirs']);
      expect(onMerged).toHaveBeenCalledWith(
        expect.objectContaining({
          ignoredLogins: expect.arrayContaining(['mine', 'theirs']),
        })
      );
      // One repair write, no more.
      expect(requests().filter((r) => r.startsWith('PATCH'))).toHaveLength(2);
    });

    it('merges a removal made by the other writer against the right base', async () => {
      const github = fakeGitHub();
      const base = withIgnored(cache(20), ['old', 'gone']);
      const gist = await writeCache(base, null);
      interleaveOnce(github, gist.id, withIgnored(base, ['old']));

      await writeCache(
        { ...withIgnored(base, ['old', 'gone', 'mine']), timestamp: 5 },
        gist.id
      );

      expect(
        [...((await readBack(gist.id))?.ignoredLogins ?? [])].sort()
      ).toEqual(['mine', 'old']);
    });

    it('works without history in any response, from the commit list', async () => {
      const github = fakeGitHub({ history: false });
      const base = withIgnored(cache(20), ['old']);
      const gist = await writeCache(base, null);
      interleaveOnce(github, gist.id, withIgnored(base, ['old', 'theirs']));

      await writeCache(
        { ...withIgnored(base, ['old', 'mine']), timestamp: 5 },
        gist.id
      );

      expect(
        [...((await readBack(gist.id))?.ignoredLogins ?? [])].sort()
      ).toEqual(['mine', 'old', 'theirs']);
    });

    it('reads a sharded cache from an earlier revision when a multi-request write is overtaken', async () => {
      const github = fakeGitHub();
      const base = withIgnored(cache(60_000, 5_000), ['old']);
      const gist = await writeCache(base, null);
      // Lands while this write is uploading its chunks, before its manifest.
      interleaveOnce(
        github,
        gist.id,
        withIgnored(base, ['old', 'theirs']),
        ({ method, files }) =>
          method === 'PATCH' && !files.includes(GIST_FILENAME)
      );

      await writeCache(
        { ...withIgnored(base, ['old', 'mine']), timestamp: 5 },
        gist.id
      );

      const stored = await readBack(gist.id);
      expect([...(stored?.ignoredLogins ?? [])].sort()).toEqual([
        'mine',
        'old',
        'theirs',
      ]);
      expect(stored?.network).toEqual(base.network);
      // Only the manifest's chunks are left.
      const manifest = JSON.parse(
        github.gists.get(gist.id)!.files.get(GIST_FILENAME)!
      );
      expect(github.fileNames(gist.id)).toEqual(
        [
          GIST_FILENAME,
          ...manifest.chunks.map((ref: { file: string }) => ref.file),
        ].sort()
      );
    });

    it('ignores another writer whose chunks are still uploading', async () => {
      const github = fakeGitHub();
      const gist = await writeCache(cache(20), null);
      let done = false;
      github.beforeRequest(({ method }) => {
        if (done || method !== 'PATCH') return;
        done = true;
        github.uploadChunkElsewhere(gist.id);
      });
      vi.mocked(ghRest).mockClear();

      await writeCache({ ...cache(21), timestamp: 5 }, gist.id);

      // That writer finds this write when its own manifest lands.
      expect(requests().filter((r) => r.startsWith('PATCH'))).toHaveLength(1);
      expect(await readBack(gist.id)).toEqual({ ...cache(21), timestamp: 5 });
    });

    it('gives up after a bounded number of repair writes', async () => {
      const github = fakeGitHub();
      const gist = await writeCache(withIgnored(cache(20), []), null);
      // Another writer lands before every single PATCH.
      let n = 0;
      github.beforeRequest(({ method }) => {
        if (method === 'PATCH') {
          github.writeElsewhere(
            gist.id,
            withIgnored(cache(20), [`theirs${++n}`])
          );
        }
      });
      vi.mocked(ghRest).mockClear();

      await writeCache(withIgnored(cache(20), ['mine']), gist.id);

      expect(requests().filter((r) => r.startsWith('PATCH'))).toHaveLength(3);
    });
  });
});

describe('a cache that exists but cannot be read', () => {
  const ignoredOf = async (gistId: string) =>
    [...((await readBack(gistId))?.ignoredLogins ?? [])].sort();

  /** A full (not `meta`) read of the gist itself. */
  const isFullRead = (gistId: string) => (request: Request) =>
    request.method === 'GET' &&
    request.path === `/gists/${gistId}` &&
    request.view === null;

  const patches = () =>
    vi.mocked(ghRest).mock.calls.filter(([, init]) => init?.method === 'PATCH')
      .length;

  it.each([
    ['a server error', 502],
    ['a rate limit', 429],
    ['a forbidden rate limit', 403],
  ])(
    'abandons a write without a base when the merge read fails with %s',
    async (_label, status) => {
      const github = fakeGitHub();
      const gist = await writeCache(
        { ...cache(20), ignoredLogins: ['old'] },
        null
      );
      // This session never read the gist; another device wrote it.
      forgetCacheBases();
      github.writeElsewhere(gist.id, {
        ...cache(20),
        ignoredLogins: ['old', 'theirs'],
      });
      let failed = false;
      github.failRead((request) => {
        if (failed || !isFullRead(gist.id)(request)) return null;
        failed = true;
        return status;
      });
      vi.mocked(ghRest).mockClear();

      await expect(
        writeCache(
          { ...cache(20), ignoredLogins: ['mine'], timestamp: 5 },
          gist.id
        )
      ).rejects.toThrow(`(${status})`);
      expect(patches()).toBe(0);
      expect(await ignoredOf(gist.id)).toEqual(['old', 'theirs']);

      // The next write (the read works again) merges instead.
      await writeCache(
        { ...cache(20), ignoredLogins: ['mine'], timestamp: 6 },
        gist.id
      );
      expect(await ignoredOf(gist.id)).toEqual(['mine', 'old', 'theirs']);
    }
  );

  it('abandons a write with a stale base when the merge read fails', async () => {
    const github = fakeGitHub();
    const gist = await writeCache(
      { ...cache(20), ignoredLogins: ['old'] },
      null
    );
    github.writeElsewhere(gist.id, {
      ...cache(20),
      ignoredLogins: ['old', 'theirs'],
    });
    github.failRead((request) => (isFullRead(gist.id)(request) ? 502 : null));

    await expect(
      writeCache(
        { ...cache(20), ignoredLogins: ['old', 'mine'], timestamp: 5 },
        gist.id
      )
    ).rejects.toThrow('(502)');
    github.failRead(null);
    expect(await ignoredOf(gist.id)).toEqual(['old', 'theirs']);
  });

  it('abandons the write when a chunk it has to fetch from its raw URL fails', async () => {
    const github = fakeGitHub();
    const gist = await writeCache(
      { ...cache(20), ignoredLogins: ['old'] },
      null
    );
    forgetCacheBases();
    github.writeElsewhere(gist.id, {
      ...cache(20),
      ignoredLogins: ['old', 'theirs'],
    });
    // Contents dropped from the response (as the proxy does over its
    // budget), and the raw fetch of a chunk is rate limited.
    const real = vi.mocked(ghRest).getMockImplementation()!;
    vi.mocked(ghRest).mockImplementation(async (path, init) => {
      const result = (await real(path, init)) as {
        files?: Record<string, { content: string | null; truncated: boolean }>;
      } | null;
      if (!init?.method && path === `/gists/${gist.id}` && result?.files) {
        for (const [name, file] of Object.entries(result.files)) {
          if (name !== GIST_FILENAME) {
            file.content = null;
            file.truncated = true;
          }
        }
      }
      return result as never;
    });
    github.failRaw((file) => (file.startsWith(GIST_CHUNK_PREFIX) ? 429 : null));

    await expect(
      writeCache(
        { ...cache(20), ignoredLogins: ['mine'], timestamp: 5 },
        gist.id
      )
    ).rejects.toThrow('(429)');
    github.failRaw(null);
    expect(await ignoredOf(gist.id)).toEqual(['old', 'theirs']);
  });

  it.each([
    ['corrupt JSON', '{"format":"sharded-1","gener'],
    [
      'a newer manifest format',
      JSON.stringify({
        format: 'sharded-2',
        generation: 'x',
        parts: ['a'],
        metadata: { cacheVersion: '5.0' },
      }),
    ],
    ['a malformed cache', JSON.stringify({ network: 'nope' })],
  ])('refuses to overwrite %s', async (_label, content) => {
    const github = fakeGitHub();
    github.seed('odd', { [GIST_FILENAME]: content });
    vi.mocked(ghRest).mockClear();

    const error = await writeCache(cache(20), 'odd').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CacheUnreadableError);
    expect(toUserMessage(error, 'fallback')).toContain("can't read");
    expect(patches()).toBe(0);
    expect(github.gists.get('odd')!.files.get(GIST_FILENAME)).toBe(content);
    expect(github.gists.size).toBe(1);
  });

  it('replaces a manifest whose chunks are missing, after reading it again', async () => {
    const github = fakeGitHub();
    const gist = await writeCache(
      { ...cache(20), ignoredLogins: ['old'] },
      null
    );
    forgetCacheBases();
    // An older version of this code deleted the chunks.
    github.edit(
      gist.id,
      Object.fromEntries(
        github
          .fileNames(gist.id)
          .filter((name) => name.startsWith(GIST_CHUNK_PREFIX))
          .map((name) => [name, null])
      )
    );
    vi.mocked(ghRest).mockClear();
    const onWarning = vi.fn();

    await writeCache(
      { ...cache(21), ignoredLogins: ['mine'], timestamp: 5 },
      gist.id,
      { onWarning }
    );

    const fullReads = vi
      .mocked(ghRest)
      .mock.calls.filter(
        ([path, init]) =>
          path === `/gists/${gist.id}` &&
          !init?.method &&
          !new Headers(init?.headers).get('x-follow-sync-gist-view')
      );
    expect(fullReads).toHaveLength(2);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(await readBack(gist.id)).toEqual({
      ...cache(21),
      ignoredLogins: ['mine'],
      timestamp: 5,
    });
  });

  it('merges instead when the second read finds the cache complete again', async () => {
    const github = fakeGitHub();
    const gist = await writeCache(
      { ...cache(20), ignoredLogins: ['old'] },
      null
    );
    forgetCacheBases();
    const chunks = github
      .fileNames(gist.id)
      .filter((name) => name.startsWith(GIST_CHUNK_PREFIX));
    github.edit(
      gist.id,
      Object.fromEntries(chunks.map((name) => [name, null]))
    );
    // Another device finishes a write between the two reads.
    let reads = 0;
    github.beforeRequest((request) => {
      if (isFullRead(gist.id)(request) && ++reads === 2) {
        github.writeElsewhere(gist.id, {
          ...cache(20),
          ignoredLogins: ['old', 'theirs'],
        });
      }
    });
    const onWarning = vi.fn();

    await writeCache(
      { ...cache(20), ignoredLogins: ['mine'], timestamp: 5 },
      gist.id,
      { onWarning }
    );

    expect(onWarning).not.toHaveBeenCalled();
    expect(await ignoredOf(gist.id)).toEqual(['mine', 'old', 'theirs']);
  });

  it('still rewrites a single-file cache too large to relay', async () => {
    const github = fakeGitHub();
    github.seed('legacy', {
      [GIST_FILENAME]: 'x'.repeat(GITHUB_INLINE_LIMIT + 1),
    });
    github.failRaw((file) => (file === GIST_FILENAME ? 413 : null));

    await writeCache(cache(6), 'legacy');

    github.failRaw(null);
    expect(await readBack('legacy')).toEqual(cache(6));
  });

  it('does not create a second cache when discovery cannot read the existing one', async () => {
    const github = fakeGitHub();
    const gist = await writeCache(
      { ...cache(20), ignoredLogins: ['old'] },
      null
    );
    forgetCacheBases();
    github.failRead((request) => (isFullRead(gist.id)(request) ? 503 : null));

    await expect(
      writeCache(cache(20), null, { discoverCanonicalFallback: true })
    ).rejects.toThrow('(503)');
    expect(github.gists.size).toBe(1);
  });
});

describe('chunk files of other writers', () => {
  const ignoredOf = async (gistId: string) =>
    [...((await readBack(gistId))?.ignoredLogins ?? [])].sort();

  /** A chunk file name of a write that started `ageMs` ago. */
  const chunkAged = (ageMs: number, n = 1) =>
    `${GIST_CHUNK_PREFIX}${(Date.now() - ageMs).toString(36)}orphan.${n}`;

  const patchBodies = () =>
    vi
      .mocked(ghRest)
      .mock.calls.filter(([, init]) => init?.method === 'PATCH')
      .map(
        ([, init]) =>
          JSON.parse(init!.body as string) as {
            files: Record<string, unknown>;
          }
      );

  it("keeps another device's chunks while its write is still uploading", async () => {
    const github = fakeGitHub();
    const base = { ...cache(20), ignoredLogins: ['old'] };
    const gist = await writeCache(base, null);
    // Another device starts a multi-request write: chunks first...
    const elsewhere = github.startWriteElsewhere(gist.id, {
      ...base,
      ignoredLogins: ['old', 'theirs'],
    });

    // ...while this session writes.
    await writeCache(
      { ...base, ignoredLogins: ['old', 'mine'], timestamp: 5 },
      gist.id
    );
    for (const chunk of elsewhere.chunks) {
      expect(github.fileNames(gist.id)).toContain(chunk);
    }

    // Its manifest lands: the cache it names is complete and readable.
    elsewhere.finish();
    expect(github.missingChunks(gist.id)).toEqual([]);
    expect(await ignoredOf(gist.id)).toEqual(['old', 'theirs']);
  });

  it('deletes orphaned chunks once they are old enough, and only those', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const github = fakeGitHub();
    const gist = await writeCache(cache(20), null);
    const old = chunkAged(ORPHAN_CHUNK_MAX_AGE_MS + 60_000);
    const young = chunkAged(ORPHAN_CHUNK_MAX_AGE_MS - 60_000);
    github.edit(gist.id, { [old]: '{', [young]: '{' });

    await writeCache({ ...cache(21), timestamp: 5 }, gist.id);

    expect(github.fileNames(gist.id)).not.toContain(old);
    expect(github.fileNames(gist.id)).toContain(young);

    // Later, the young one has aged too.
    vi.setSystemTime(Date.now() + 2 * 60_000);
    await writeCache({ ...cache(22), timestamp: 6 }, gist.id);
    expect(github.fileNames(gist.id)).not.toContain(young);
    expect(github.missingChunks(gist.id)).toEqual([]);
  });

  describe("a writer from an older version deleting this write's chunks", () => {
    /** Lands right before this session's manifest, deleting every other chunk. */
    const overtakeBeforeManifest = (
      github: ReturnType<typeof fakeGitHub>,
      id: string,
      data: CachedData,
      times = 1
    ) => {
      let n = 0;
      github.beforeRequest(({ method, files }) => {
        if (n >= times || method !== 'PATCH' || !files.includes(GIST_FILENAME))
          return;
        n += 1;
        // Based on what it read: the cache as it is now.
        const live = github.liveData(id) ?? data;
        github.writeElsewhere(
          id,
          {
            ...live,
            ignoredLogins: [...(live.ignoredLogins ?? []), `theirs${n}`],
          },
          { sweep: 'all' }
        );
      });
    };

    it('does not write at all when the revisions to verify against cannot be listed', async () => {
      const github = fakeGitHub({ history: false });
      const base = { ...cache(60_000, 5_000), ignoredLogins: ['old'] };
      const gist = await writeCache(base, null);
      overtakeBeforeManifest(github, gist.id, base);
      github.failRead((request) =>
        request.path.includes('/commits') ? 403 : null
      );

      await expect(
        writeCache(
          { ...base, ignoredLogins: ['old', 'mine'], timestamp: 5 },
          gist.id
        )
      ).rejects.toThrow();

      github.failRead(null);
      github.beforeRequest(null);
      expect(github.missingChunks(gist.id)).toEqual([]);
      expect(await ignoredOf(gist.id)).toEqual(['old']);
    }, 30_000);

    it('uploads its deleted chunks again so the cache stays readable when the check after writing fails', async () => {
      const github = fakeGitHub({ history: false });
      const base = { ...cache(60_000, 5_000), ignoredLogins: ['old'] };
      const gist = await writeCache(base, null);
      overtakeBeforeManifest(github, gist.id, base);
      // The commit list works for the check before writing, then fails.
      let commitLists = 0;
      github.failRead((request) =>
        request.path.includes('/commits') && ++commitLists > 1 ? 403 : null
      );

      await writeCache(
        { ...base, ignoredLogins: ['old', 'mine'], timestamp: 5 },
        gist.id
      );

      github.failRead(null);
      github.beforeRequest(null);
      expect(github.missingChunks(gist.id)).toEqual([]);
      expect(await ignoredOf(gist.id)).toEqual(['mine', 'old']);
    }, 30_000);

    it('repairs and stays readable when it overtakes every repair write', async () => {
      const github = fakeGitHub();
      const base = { ...cache(60_000, 5_000), ignoredLogins: ['old'] };
      const gist = await writeCache(base, null);
      overtakeBeforeManifest(github, gist.id, base, Infinity);
      const onWarning = vi.fn();

      await writeCache(
        { ...base, ignoredLogins: ['old', 'mine'], timestamp: 5 },
        gist.id,
        { onWarning }
      );

      github.beforeRequest(null);
      expect(onWarning).toHaveBeenCalledTimes(1);
      expect(github.missingChunks(gist.id)).toEqual([]);
      const stored = await readBack(gist.id);
      expect(stored?.network).toEqual(base.network);
      expect(stored?.ignoredLogins).toEqual(
        expect.arrayContaining(['old', 'mine', 'theirs1', 'theirs2'])
      );
    }, 60_000);
  });

  it('points the gist back at this write when it is left broken and the check fails', async () => {
    const github = fakeGitHub({ history: false });
    const gist = await writeCache(
      { ...cache(20), ignoredLogins: ['old'] },
      null
    );
    // After this write lands, a broken cache replaces it (a manifest whose
    // chunks are gone) and the commit list fails, so nothing can be merged.
    let commitLists = 0;
    github.failRead((request) => {
      if (!request.path.includes('/commits') || ++commitLists === 1) {
        return null;
      }
      if (commitLists === 2) {
        github.writeElsewhere(gist.id, cache(20));
        const live = JSON.parse(
          github.gists.get(gist.id)!.files.get(GIST_FILENAME)!
        ) as { chunks: Array<{ file: string }> };
        github.edit(
          gist.id,
          Object.fromEntries(live.chunks.map((ref) => [ref.file, null]))
        );
      }
      return 403;
    });
    const onWarning = vi.fn();

    await writeCache(
      { ...cache(20), ignoredLogins: ['old', 'mine'], timestamp: 5 },
      gist.id,
      { onWarning }
    );

    github.failRead(null);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(github.missingChunks(gist.id)).toEqual([]);
    expect(await ignoredOf(gist.id)).toEqual(['mine', 'old']);
  });

  it('verifies the last repair write and warns when another writer is still found', async () => {
    const github = fakeGitHub();
    const gist = await writeCache({ ...cache(20), ignoredLogins: [] }, null);
    let n = 0;
    github.beforeRequest(({ method }) => {
      if (method === 'PATCH') {
        const live = github.liveData(gist.id)!;
        github.writeElsewhere(gist.id, {
          ...live,
          ignoredLogins: [...(live.ignoredLogins ?? []), `theirs${++n}`],
        });
      }
    });
    const onWarning = vi.fn();

    await writeCache({ ...cache(20), ignoredLogins: ['mine'] }, gist.id, {
      onWarning,
    });

    github.beforeRequest(null);
    expect(patchBodies()).toHaveLength(3);
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(github.missingChunks(gist.id)).toEqual([]);
    expect(await ignoredOf(gist.id)).toEqual(
      expect.arrayContaining(['mine', 'theirs1', 'theirs2'])
    );
  });

  describe('deleting a file that is already gone', () => {
    it('retries without the deletions when GitHub refuses them', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const github = fakeGitHub({ deleteAbsent: '422' });
      const gist = await writeCache(cache(20), null);
      const old = chunkAged(ORPHAN_CHUNK_MAX_AGE_MS + 60_000);
      github.edit(gist.id, { [old]: '{' });
      // Someone else deletes it between the check and this write.
      let done = false;
      github.beforeRequest(({ method }) => {
        if (done || method !== 'PATCH') return;
        done = true;
        github.edit(gist.id, { [old]: null });
      });
      vi.mocked(ghRest).mockClear();

      await writeCache({ ...cache(21), timestamp: 5 }, gist.id);

      const bodies = patchBodies();
      expect(bodies).toHaveLength(2);
      expect(bodies[0].files[old]).toBeNull();
      expect(old in bodies[1].files).toBe(false);
      expect(await readBack(gist.id)).toEqual({ ...cache(21), timestamp: 5 });
    });

    it('takes the deletions from the last chunk upload of a multi-request write', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const github = fakeGitHub({ deleteAbsent: '422' });
      const original = cache(60_000, 5_000);
      const gist = await writeCache(original, null);
      const old = chunkAged(ORPHAN_CHUNK_MAX_AGE_MS + 60_000);
      github.edit(gist.id, { [old]: '{' });
      // Gone after the check, before this write's first chunk upload.
      let done = false;
      github.beforeRequest(({ method }) => {
        if (done || method !== 'PATCH') return;
        done = true;
        github.edit(gist.id, { [old]: null });
      });
      vi.mocked(ghRest).mockClear();
      const updated = { ...cache(60_000, 5_001), timestamp: 5 };

      await writeCache(updated, gist.id);

      const bodies = patchBodies();
      expect(bodies.some((body) => old in body.files)).toBe(false);
      // No refused request was sent again.
      expect(bodies.filter((body) => GIST_FILENAME in body.files)).toHaveLength(
        1
      );
      expect(await readBack(gist.id)).toEqual(updated);
    }, 30_000);
  });

  describe('a gist with more files than GitHub lists', () => {
    it('does not write over a cache file the listing leaves out', async () => {
      const github = fakeGitHub({ fileListLimit: 2 });
      const { manifest, chunks } = buildShardedCache(
        cache(20),
        newGeneration()
      );
      github.seed('busy', {
        '0-notes.txt': 'a',
        '1-notes.txt': 'b',
        [GIST_FILENAME]: manifest,
        ...Object.fromEntries(
          chunks.map(({ file, content }) => [file, content])
        ),
      });

      await expect(writeCache(cache(21), 'busy')).rejects.toBeInstanceOf(
        CacheUnreadableError
      );
      expect(github.gists.get('busy')!.files.get(GIST_FILENAME)).toBe(manifest);
    });

    it('reads the chunks the listing leaves out and sweeps stale files', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const github = fakeGitHub({ fileListLimit: 5 });
      const gist = await writeCache(
        { ...cache(20), ignoredLogins: ['old'] },
        null
      );
      forgetCacheBases();
      github.writeElsewhere(gist.id, {
        ...cache(20),
        ignoredLogins: ['old', 'theirs'],
      });
      // Old orphans sort before the live chunk, pushing it out of the list.
      const orphans = Array.from({ length: 6 }, (_, i) =>
        chunkAged(ORPHAN_CHUNK_MAX_AGE_MS + 60_000, i + 1)
      );
      github.edit(
        gist.id,
        Object.fromEntries(orphans.map((name) => [name, '{']))
      );

      await writeCache(
        { ...cache(20), ignoredLogins: ['mine'], timestamp: 5 },
        gist.id
      );

      // Merged, not mistaken for a broken cache and written over.
      expect(await ignoredOf(gist.id)).toEqual(['mine', 'old', 'theirs']);
      const left = () =>
        orphans.filter((name) => github.fileNames(gist.id).includes(name));
      expect(left().length).toBeLessThan(orphans.length);

      // Each write sweeps what it can see, until none are left.
      for (let i = 0; i < 3 && left().length > 0; i++) {
        await writeCache(
          { ...cache(20), ignoredLogins: ['mine'], timestamp: 6 + i },
          gist.id
        );
      }
      expect(left()).toEqual([]);
      expect(github.missingChunks(gist.id)).toEqual([]);
    });
  });
});

describe('revision order', () => {
  it.each([
    ['with history', { history: true }],
    ['without history', { history: false }],
  ])(
    'merges an interleaved write when revisions are listed oldest first (%s)',
    async (_label, options) => {
      const github = fakeGitHub({ ...options, order: 'oldest-first' });
      const base = { ...cache(20), ignoredLogins: ['old'] };
      const gist = await writeCache(base, null);
      let done = false;
      github.beforeRequest(({ method }) => {
        if (done || method !== 'PATCH') return;
        done = true;
        github.writeElsewhere(gist.id, {
          ...base,
          ignoredLogins: ['old', 'theirs'],
        });
      });

      await writeCache(
        { ...base, ignoredLogins: ['old', 'mine'], timestamp: 5 },
        gist.id
      );

      expect(
        [...((await readBack(gist.id))?.ignoredLogins ?? [])].sort()
      ).toEqual(['mine', 'old', 'theirs']);
    }
  );

  it('notices a write landing right after the check when there is no history', async () => {
    const github = fakeGitHub({ history: false });
    const base = { ...cache(20), ignoredLogins: ['old'] };
    const gist = await writeCache(base, null);
    // Lands between the revision check and the commit listing.
    let done = false;
    github.beforeRequest(({ method, path }) => {
      if (done || method !== 'GET' || !path.includes('/commits')) return;
      done = true;
      github.writeElsewhere(gist.id, {
        ...base,
        ignoredLogins: ['old', 'theirs'],
      });
    });

    await writeCache(
      { ...base, ignoredLogins: ['old', 'mine'], timestamp: 5 },
      gist.id
    );

    expect(
      [...((await readBack(gist.id))?.ignoredLogins ?? [])].sort()
    ).toEqual(['mine', 'old', 'theirs']);
  });
});

describe('the base a write records', () => {
  const ignoredOf = async (gistId: string) =>
    [...((await readBack(gistId))?.ignoredLogins ?? [])].sort();

  /** This session reads the cache (as loading it into the stores does). */
  const readAsBase = async (gistId: string) => {
    const { canonicalGist } = await findCanonicalCacheGist({
      ownerLogin: OWNER,
      preferredGistId: gistId,
    });
    rememberCacheBase(canonicalGist!, parseCache(canonicalGist!)!);
  };

  it.each([
    ['without onMerged', undefined],
    ['when the caller does not adopt the merge', () => false],
  ])(
    'keeps a merged-in change the caller never loaded (%s)',
    async (_label, onMerged) => {
      const github = fakeGitHub();
      const gist = await writeCache({ ...cache(20), ignoredLogins: [] }, null);
      forgetCacheBases();
      await readAsBase(gist.id);
      github.writeElsewhere(gist.id, { ...cache(20), ignoredLogins: ['x'] });

      // This write merges "x" in, but the caller's state still lacks it...
      await writeCache({ ...cache(20), ignoredLogins: [] }, gist.id, {
        onMerged,
      });
      expect(await ignoredOf(gist.id)).toEqual(['x']);

      // ...so the next write from that state must not drop it as a removal.
      await writeCache(
        { ...cache(20), ignoredLogins: [], timestamp: 9 },
        gist.id
      );
      expect(await ignoredOf(gist.id)).toEqual(['x']);
    }
  );

  it('treats a missing entry as a removal once the caller adopted the merge', async () => {
    const github = fakeGitHub();
    const gist = await writeCache({ ...cache(20), ignoredLogins: [] }, null);
    github.writeElsewhere(gist.id, { ...cache(20), ignoredLogins: ['x'] });
    await writeCache({ ...cache(20), ignoredLogins: [] }, gist.id, {
      onMerged: () => true,
    });

    // The user un-ignores "x" here.
    await writeCache(
      { ...cache(20), ignoredLogins: [], timestamp: 9 },
      gist.id
    );

    expect(await ignoredOf(gist.id)).toEqual([]);
  });
});
