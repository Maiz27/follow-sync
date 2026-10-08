import { afterEach, describe, expect, it, vi } from 'vitest';

import { GIST_FILENAME } from '@/lib/constants';

// The gateway is the only I/O boundary in gist.ts, so faking it makes the
// canonical-gist scoring/selection testable without any real network.
vi.mock('@/lib/ghRest', () => ({
  ghRest: vi.fn(),
  ghRestOk: vi.fn(),
  ghGistRaw: vi.fn(),
  GitHubRestError: class extends Error {},
}));

import { ghGistRaw, ghRest } from '@/lib/ghRest';
import {
  findCanonicalCacheGist,
  scoreCacheGist,
  buildCacheDescription,
  parseCache,
} from '@/lib/gist';
import type { CacheGist } from '@/lib/types';

const mockedGhRest = vi.mocked(ghRest);
const mockedGhGistRaw = vi.mocked(ghGistRaw);

const OWNER = 'octocat';

const cacheContent = (ownerLogin: string) =>
  JSON.stringify({
    network: { followers: [], following: [] },
    ghosts: [],
    removedGhosts: [],
    timestamp: 0,
    metadata: {
      totalConnections: 0,
      fetchDuration: 0,
      cacheVersion: '3.0',
      ownerLogin,
      cacheKey: `follow-sync:${ownerLogin}:network-cache`,
    },
  });

const summary = (id: string, ownerLogin: string) => ({
  id,
  description: buildCacheDescription(ownerLogin),
  public: false,
  updated_at: '2024-01-01T00:00:00Z',
  files: { [GIST_FILENAME]: { filename: GIST_FILENAME } },
});

const detail = (id: string, ownerLogin: string) => ({
  ...summary(id, ownerLogin),
  files: {
    [GIST_FILENAME]: {
      filename: GIST_FILENAME,
      content: cacheContent(ownerLogin),
    },
  },
});

afterEach(() => vi.clearAllMocks());

describe('scoreCacheGist', () => {
  const gistFor = (ownerLogin: string): CacheGist => ({
    id: 'g',
    name: 'g',
    description: buildCacheDescription(ownerLogin),
    updatedAt: '2024-01-01T00:00:00Z',
    files: [{ name: GIST_FILENAME, text: cacheContent(ownerLogin) }],
  });

  it('scores a gist owned by the user above one owned by someone else', () => {
    expect(scoreCacheGist(gistFor(OWNER), OWNER)).toBeGreaterThan(
      scoreCacheGist(gistFor('someoneelse'), OWNER)
    );
  });

  it('scores a non-cache gist at zero', () => {
    const empty: CacheGist = {
      id: 'g',
      name: 'g',
      description: 'just some notes',
      updatedAt: '2024-01-01T00:00:00Z',
      files: [{ name: 'notes.txt', text: 'hello' }],
    };
    expect(scoreCacheGist(empty, OWNER)).toBe(0);
  });
});

describe('findCanonicalCacheGist', () => {
  it('selects the newest owner-matching gist as canonical and the rest as duplicates', async () => {
    mockedGhRest.mockImplementation(async (path: string) => {
      if (path.startsWith('/gists?')) {
        return [summary('A', OWNER), summary('C', OWNER)] as never;
      }
      if (path === '/gists/A') return detail('A', OWNER) as never;
      if (path === '/gists/C')
        return {
          ...detail('C', OWNER),
          updated_at: '2023-01-01T00:00:00Z',
        } as never;
      return null;
    });

    const { canonicalGist, duplicateGists } = await findCanonicalCacheGist({
      ownerLogin: OWNER,
    });

    expect(canonicalGist?.id).toBe('A');
    expect(duplicateGists.map((g) => g.id)).toEqual(['C']);
  });

  it('rejects caches whose recorded owner is a different login', async () => {
    mockedGhRest.mockImplementation(async (path: string) => {
      if (path.startsWith('/gists?')) {
        return [summary('A', OWNER), summary('B', 'someoneelse')] as never;
      }
      if (path === '/gists/A') return detail('A', OWNER) as never;
      if (path === '/gists/B') return detail('B', 'someoneelse') as never;
      return null;
    });

    const { canonicalGist, duplicateGists } = await findCanonicalCacheGist({
      ownerLogin: OWNER,
    });

    expect(canonicalGist?.id).toBe('A');
    expect(duplicateGists).toEqual([]);
  });

  it('never uses a remembered gist id that belongs to another account', async () => {
    // Secret gists are readable by id, so a gist id left in localStorage by a
    // previous user of this browser must not be accepted.
    mockedGhRest.mockImplementation(async (path: string) => {
      if (path.startsWith('/gists?')) return [] as never;
      if (path === '/gists/PREV')
        return {
          ...detail('PREV', 'previoususer'),
          owner: { login: 'previoususer' },
        } as never;
      return null;
    });

    const result = await findCanonicalCacheGist({
      ownerLogin: OWNER,
      preferredGistId: 'PREV',
    });

    expect(result.canonicalGist).toBeNull();
  });

  it('rejects a gist owned by another account even if its metadata claims this owner', async () => {
    mockedGhRest.mockImplementation(async (path: string) => {
      if (path.startsWith('/gists?')) return [] as never;
      if (path === '/gists/X')
        return { ...detail('X', OWNER), owner: { login: 'mallory' } } as never;
      return null;
    });

    const result = await findCanonicalCacheGist({
      ownerLogin: OWNER,
      preferredGistId: 'X',
    });

    expect(result.canonicalGist).toBeNull();
  });

  it('returns no canonical gist when none score above zero', async () => {
    mockedGhRest.mockResolvedValue([] as never);

    const result = await findCanonicalCacheGist({ ownerLogin: OWNER });

    expect(result.canonicalGist).toBeNull();
    expect(result.duplicateGists).toEqual([]);
  });

  it('loads truncated cache files from raw_url', async () => {
    mockedGhRest.mockImplementation(async (path: string) => {
      if (path.startsWith('/gists?')) return [summary('A', OWNER)] as never;
      if (path === '/gists/A')
        return {
          ...summary('A', OWNER),
          files: {
            [GIST_FILENAME]: {
              filename: GIST_FILENAME,
              content: '{"network":{"follo',
              truncated: true,
              raw_url: 'https://gist.githubusercontent.com/o/A/raw/x/file',
            },
          },
        } as never;
      return null;
    });
    mockedGhGistRaw.mockResolvedValue(cacheContent(OWNER));

    const { canonicalGist } = await findCanonicalCacheGist({
      ownerLogin: OWNER,
    });

    expect(mockedGhGistRaw).toHaveBeenCalledWith(
      'https://gist.githubusercontent.com/o/A/raw/x/file'
    );
    expect(
      canonicalGist && parseCache(canonicalGist)?.metadata.ownerLogin
    ).toBe(OWNER);
  });

  it('skips listing every gist when the remembered gist validates', async () => {
    mockedGhRest.mockImplementation(async (path: string) => {
      if (path === '/gists/A') return detail('A', OWNER) as never;
      throw new Error(`unexpected request ${path}`);
    });

    const result = await findCanonicalCacheGist({
      ownerLogin: OWNER,
      preferredGistId: 'A',
    });

    expect(result.canonicalGist?.id).toBe('A');
    expect(result.scannedAll).toBe(false);
    expect(mockedGhRest).toHaveBeenCalledTimes(1);
  });

  it('still lists every gist when a full scan is requested', async () => {
    mockedGhRest.mockImplementation(async (path: string) => {
      if (path.startsWith('/gists?'))
        return [summary('A', OWNER), summary('C', OWNER)] as never;
      if (path === '/gists/A') return detail('A', OWNER) as never;
      if (path === '/gists/C')
        return {
          ...detail('C', OWNER),
          updated_at: '2020-01-01T00:00:00Z',
        } as never;
      return null;
    });

    const result = await findCanonicalCacheGist({
      ownerLogin: OWNER,
      preferredGistId: 'A',
      fullScan: true,
    });

    expect(result.scannedAll).toBe(true);
    expect(result.duplicateGists.map((g) => g.id)).toEqual(['C']);
  });
});
