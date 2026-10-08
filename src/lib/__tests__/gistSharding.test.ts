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
  forgetCacheBases,
  parseCache,
  rememberCacheBase,
  serializeCache,
  writeCache,
} from '@/lib/gist';
import { decodeCache, encodeCache } from '@/lib/cacheCodec';
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

type Request = { method: string; path: string; files: string[] };

/**
 * An in-memory stand-in for the Gist API behind the proxy. Every change makes
 * a revision (with a SHA version) and the gist keeps its history, like
 * GitHub: `GET /gists/{id}/{sha}` and raw URLs read a revision as it was, and
 * `GET /gists/{id}/commits` lists them. PATCH merges files (null deletes),
 * inline content is cut at 1 MB like GitHub does, the proxy's `meta` view and
 * history trimming are applied, and request bodies over the host limit are
 * refused like Vercel does. `history` / `historyOnWrite` false leave the
 * (deprecated) history out of every response / of write responses.
 */
const fakeGitHub = ({ history = true, historyOnWrite = true } = {}) => {
  type Revision = { version: string; files: Map<string, string> };
  const gists = new Map<
    string,
    { description: string; files: Map<string, string>; revisions: Revision[] }
  >();
  const bodies: number[] = [];
  let nextId = 1;
  let generationCount = 0;
  let failWhen: ((method: string, files: string[]) => boolean) | null = null;
  let beforeRequest: ((request: Request) => void) | null = null;

  const commit = (id: string) => {
    const gist = gists.get(id)!;
    gist.revisions.push({ version: sha(), files: new Map(gist.files) });
  };

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
    return {
      id,
      description: gist.description,
      public: false,
      updated_at: '2024-01-01T00:00:00Z',
      ...(history && withHistory
        ? {
            history: gist.revisions
              .slice(0, upTo + 1)
              .reverse()
              .slice(0, PROXY_HISTORY)
              .map(({ version }) => ({ version })),
          }
        : {}),
      owner: { login: OWNER },
      files: Object.fromEntries(
        [...revision.files].map(([name, content]) => {
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
    if (path.startsWith('/gists?')) {
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
    beforeRequest?.({ method, path, files });
    if (failWhen?.(method, files)) {
      throw new Error('GitHub request failed (502): network');
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
    const headers = new Headers(init?.headers);
    const omitContent = headers.get('x-follow-sync-gist-view') === 'meta';

    if (sub === 'commits') {
      const perPage = Number(/per_page=(\d+)/.exec(path)?.[1] ?? 30);
      return [...gist.revisions]
        .reverse()
        .slice(0, perPage)
        .map(({ version }) => ({ version })) as never;
    }
    if (sub) {
      return view(id, { omitContent, version: sub }) as never;
    }

    if (method === 'PATCH') {
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
    const content = gists
      .get(id)
      ?.revisions.find((revision) => revision.version === version)
      ?.files.get(decodeURIComponent(name));
    if (content === undefined) throw new Error('raw 404');
    return content;
  });

  const currentGeneration = (id: string) => {
    const manifest = gists.get(id)!.files.get(GIST_FILENAME);
    try {
      return (JSON.parse(manifest ?? '') as { generation?: string }).generation;
    } catch {
      return undefined;
    }
  };

  return {
    gists,
    bodies,
    /**
     * Another device writes `data` to the gist in one request, as this code
     * would: based on the cache it holds now, replacing its chunks.
     */
    writeElsewhere: (id: string, data: CachedData) => {
      const gist = gists.get(id)!;
      const { manifest, chunks } = buildShardedCache(
        data,
        `elsewhere${++generationCount}`,
        currentGeneration(id) ?? null
      );
      gist.files = new Map([
        ...[...gist.files].filter(
          ([name]) =>
            name !== GIST_FILENAME && !name.startsWith(GIST_CHUNK_PREFIX)
        ),
        [GIST_FILENAME, manifest],
        ...chunks.map(
          ({ file, content }) => [file, content] as [string, string]
        ),
      ]);
      commit(id);
    },
    /** Another device uploads a chunk file without its manifest (yet). */
    uploadChunkElsewhere: (id: string) => {
      gists
        .get(id)!
        .files.set(`${GIST_CHUNK_PREFIX}inprogress${++generationCount}.1`, '{');
      commit(id);
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
    failWhen: (fn: typeof failWhen) => {
      failWhen = fn;
    },
    beforeRequest: (fn: typeof beforeRequest) => {
      beforeRequest = fn;
    },
    fileNames: (id: string) => [...gists.get(id)!.files.keys()].sort(),
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
