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

/**
 * An in-memory stand-in for the Gist API behind the proxy: PATCH merges files
 * (null deletes), inline content is cut at 1 MB like GitHub does, and request
 * bodies over the host limit are refused like Vercel does.
 */
const fakeGitHub = ({ historyOnWrite = true } = {}) => {
  const gists = new Map<
    string,
    { description: string; files: Map<string, string>; version?: number }
  >();
  const bodies: number[] = [];
  let nextId = 1;
  let failWhen: ((method: string, files: string[]) => boolean) | null = null;

  const view = (id: string, omitContent = false, withHistory = true) => {
    const gist = gists.get(id)!;
    return {
      id,
      description: gist.description,
      public: false,
      updated_at: `2024-01-01T00:00:${String(gist.version ?? 0).padStart(2, '0')}Z`,
      ...(withHistory
        ? { history: [{ version: `v${gist.version ?? 0}` }] }
        : {}),
      owner: { login: OWNER },
      files: Object.fromEntries(
        [...gist.files].map(([name, content]) => {
          const truncated = omitContent || content.length > GITHUB_INLINE_LIMIT;
          return [
            name,
            {
              filename: name,
              content: omitContent
                ? null
                : content.slice(0, GITHUB_INLINE_LIMIT),
              truncated,
              raw_url: `https://gist.githubusercontent.com/${OWNER}/${id}/raw/${encodeURIComponent(name)}`,
            },
          ];
        })
      ),
    };
  };

  vi.mocked(ghRest).mockImplementation(async (path, init) => {
    const method = init?.method ?? 'GET';
    if (path.startsWith('/gists?')) {
      return [...gists.keys()].map((id) => view(id, true)) as never;
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
    if (failWhen?.(method, Object.keys(body.files ?? {}))) {
      throw new Error('GitHub request failed (502): network');
    }

    if (path === '/gists' && method === 'POST') {
      const id = `g${nextId++}`;
      gists.set(id, { description: body.description ?? '', files: new Map() });
      for (const [name, file] of Object.entries(body.files ?? {})) {
        if (file) gists.get(id)!.files.set(name, file.content);
      }
      return view(id, false, historyOnWrite) as never;
    }

    const id = path.replace('/gists/', '');
    const gist = gists.get(id);
    if (!gist) return null;
    if (method === 'PATCH') {
      gist.version = (gist.version ?? 0) + 1;
      if (body.description) gist.description = body.description;
      for (const [name, file] of Object.entries(body.files ?? {})) {
        if (file) gist.files.set(name, file.content);
        else gist.files.delete(name);
      }
    }
    const headers = new Headers(init?.headers);
    return view(
      id,
      headers.get('x-follow-sync-gist-view') === 'meta',
      method === 'GET' || historyOnWrite
    ) as never;
  });

  vi.mocked(ghGistRaw).mockImplementation(async (rawUrl) => {
    const [, id, name] = /\/([^/]+)\/raw\/([^/]+)$/.exec(rawUrl) ?? [];
    const content = gists.get(id)?.files.get(decodeURIComponent(name));
    if (content === undefined) throw new Error('raw 404');
    return content;
  });

  return {
    gists,
    bodies,
    /** Another device writes `data` to the gist. */
    writeElsewhere: (id: string, data: CachedData) => {
      const gist = gists.get(id)!;
      const { manifest, chunks } = buildShardedCache(data, 'elsewhere');
      gist.files = new Map([
        [GIST_FILENAME, manifest],
        ...chunks.map(
          ({ file, content }) => [file, content] as [string, string]
        ),
      ]);
      gist.version = (gist.version ?? 0) + 1;
    },
    failWhen: (fn: typeof failWhen) => {
      failWhen = fn;
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
    vi.mocked(ghRest).mockImplementation((path, init) =>
      real(path, {
        ...init,
        headers: path.startsWith('/gists/')
          ? { 'x-follow-sync-gist-view': 'meta' }
          : init?.headers,
      })
    );

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
    github.gists.set('legacy', {
      description: buildCacheDescription(OWNER),
      files: new Map([[GIST_FILENAME, serializeCache(encodeCache(cache(5)))]]),
    });

    await writeCache(cache(6), 'legacy');

    expect(github.fileNames('legacy')).toHaveLength(2);
    expect(await readBack('legacy')).toEqual(cache(6));
  });

  it('keeps a single-file cache too large to relay as the cache to rewrite', async () => {
    const github = fakeGitHub();
    const huge = 'x'.repeat(GITHUB_INLINE_LIMIT + 1);
    github.gists.set('legacy', {
      description: buildCacheDescription(OWNER),
      files: new Map([[GIST_FILENAME, huge]]),
    });
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

    await writeCache({ ...cache(22), timestamp: 6 }, gist.id);

    expect(requests()).toEqual([
      `GET(meta) /gists/${gist.id}`,
      `PATCH /gists/${gist.id}`,
    ]);
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

  it('overwrites as before when this session never read the gist', async () => {
    const github = fakeGitHub();
    const gist = await writeCache(withIgnored(cache(20), []), null);
    forgetCacheBases();
    github.writeElsewhere(gist.id, withIgnored(cache(20), ['theirs']));

    await writeCache(withIgnored(cache(20), ['mine']), gist.id);

    expect((await readBack(gist.id))?.ignoredLogins).toEqual(['mine']);
  });
});
