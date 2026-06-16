import { afterEach, describe, expect, it, vi } from 'vitest';

import { GIST_FILENAME } from '@/lib/constants';

// The gateway is the only I/O boundary in gist.ts, so faking it makes the
// canonical-gist scoring/selection testable without any real network.
vi.mock('@/lib/ghRest', () => ({
  ghRest: vi.fn(),
  ghRestOk: vi.fn(),
  GitHubRestError: class extends Error {},
}));

import { ghRest } from '@/lib/ghRest';
import {
  findCanonicalCacheGist,
  scoreCacheGist,
  buildCacheDescription,
} from '@/lib/gist';
import type { CacheGist } from '@/lib/types';

const mockedGhRest = vi.mocked(ghRest);

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
    [GIST_FILENAME]: { filename: GIST_FILENAME, content: cacheContent(ownerLogin) },
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
  it('selects the owner-matching gist as canonical and the rest as duplicates', async () => {
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
    expect(duplicateGists.map((g) => g.id)).toEqual(['B']);
  });

  it('returns no canonical gist when none score above zero', async () => {
    mockedGhRest.mockResolvedValue([] as never);

    const result = await findCanonicalCacheGist({ ownerLogin: OWNER });

    expect(result.canonicalGist).toBeNull();
    expect(result.duplicateGists).toEqual([]);
  });
});
