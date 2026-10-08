import { describe, expect, it } from 'vitest';

import {
  COMPACT_CACHE_FORMAT,
  decodeCache,
  encodeCache,
} from '@/lib/cacheCodec';
import { serializeCache } from '@/lib/gist';
import type { CachedData, NetworkUser } from '@/lib/types';

const user = (
  login: string,
  extra: Partial<NetworkUser> = {}
): NetworkUser => ({
  __typename: 'User',
  id: `MDQ6VXNlcj${login}`,
  login,
  name: `Name ${login}`,
  avatarUrl: `https://avatars.githubusercontent.com/u/123${login.length}?v=4`,
  url: `https://github.com/${login}`,
  followers: { totalCount: 12 },
  following: { totalCount: 34 },
  accountType: 'user',
  ...extra,
});

const cache = (count: number): CachedData => ({
  network: {
    followers: Array.from({ length: count }, (_, i) => user(`follower${i}`)),
    following: [
      user('acme', { accountType: 'organization', name: null }),
      ...Array.from({ length: count }, (_, i) => user(`following${i}`)),
    ],
  },
  ghosts: [
    user('gone', { accountType: 'ghost', removable: true }),
    user('fan', { accountType: 'ghost', removable: false }),
  ],
  removedGhosts: ['old'],
  settings: { showAvatars: true, paginationPageSize: 100, customStaleTime: 5 },
  timestamp: 123,
  metadata: {
    totalConnections: count * 2 + 1,
    fetchDuration: 1,
    cacheVersion: '3.0',
    ownerLogin: 'octocat',
    cacheKey: 'follow-sync:octocat:network-cache',
  },
});

describe('compact cache codec', () => {
  it('round-trips losslessly', () => {
    const original = cache(3);
    const restored = decodeCache(
      JSON.parse(serializeCache(encodeCache(original)))
    );
    expect(restored).toEqual(original);
  });

  it('keeps non-default avatar URLs intact', () => {
    const original = cache(0);
    original.network.followers = [
      user('x', { avatarUrl: 'https://example.com/a.png' }),
    ];
    expect(
      decodeCache(encodeCache(original))?.network.followers[0].avatarUrl
    ).toBe('https://example.com/a.png');
  });

  it('passes legacy (object format) caches through unchanged', () => {
    const legacy = cache(2);
    expect(decodeCache(JSON.parse(JSON.stringify(legacy)))).toEqual(legacy);
  });

  it('is at least 2.5x smaller than the legacy format', () => {
    const data = cache(500);
    const legacySize = serializeCache(data).length;
    const compact = encodeCache(data);
    expect(compact.format).toBe(COMPACT_CACHE_FORMAT);
    expect(legacySize / serializeCache(compact).length).toBeGreaterThan(2.5);
  });

  it.each([
    ['a number', 42],
    ['null', null],
    ['an empty object', {}],
    ['a network that is not lists', { network: 1, metadata: {} }],
    [
      'missing metadata',
      { network: { followers: [], following: [] }, ghosts: [] },
    ],
    [
      'a compact cache with non-list users',
      {
        format: COMPACT_CACHE_FORMAT,
        network: { followers: 'x', following: [] },
        ghosts: [],
        metadata: {},
      },
    ],
  ])('rejects %s instead of passing it through', (_, value) => {
    expect(decodeCache(value)).toBeNull();
  });
});
