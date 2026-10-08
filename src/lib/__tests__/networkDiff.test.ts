import { describe, expect, it } from 'vitest';

import { MAX_DIFF_ENTRIES, diffNetworks, hasChanges } from '@/lib/networkDiff';
import { decodeCache, encodeCache } from '@/lib/cacheCodec';
import type { CachedData, NetworkUser } from '@/lib/types';

const u = (login: string): NetworkUser => ({
  __typename: 'User',
  id: `id-${login}`,
  login,
  name: null,
  avatarUrl: '',
  url: '',
  followers: { totalCount: 0 },
  following: { totalCount: 0 },
});

describe('diffNetworks', () => {
  it('reports new/lost followers and following changes case-insensitively', () => {
    const diff = diffNetworks(
      {
        followers: [u('Stay'), u('gone')],
        following: [u('kept'), u('dropped')],
      },
      { followers: [u('stay'), u('new')], following: [u('kept'), u('added')] },
      { since: 1, at: 2 }
    );

    expect(diff.newFollowers).toEqual(['new']);
    expect(diff.lostFollowers).toEqual(['gone']);
    expect(diff.newFollowing).toEqual(['added']);
    expect(diff.removedFollowing).toEqual(['dropped']);
    expect(diff.counts).toEqual({
      newFollowers: 1,
      lostFollowers: 1,
      newFollowing: 1,
      removedFollowing: 1,
    });
    expect(hasChanges(diff)).toBe(true);
  });

  it('is empty when nothing changed', () => {
    const network = { followers: [u('a')], following: [u('b')] };
    expect(
      hasChanges(diffNetworks(network, network, { since: 1, at: 2 }))
    ).toBe(false);
  });

  it('caps stored logins but keeps full counts', () => {
    const many = Array.from({ length: MAX_DIFF_ENTRIES + 5 }, (_, i) =>
      u(`f${i}`)
    );
    const diff = diffNetworks(
      { followers: [], following: [] },
      { followers: many, following: [] },
      { since: 1, at: 2 }
    );
    expect(diff.newFollowers).toHaveLength(MAX_DIFF_ENTRIES);
    expect(diff.counts.newFollowers).toBe(MAX_DIFF_ENTRIES + 5);
  });

  it('survives the cache round trip together with the ignore list', () => {
    const lastDiff = diffNetworks(
      { followers: [], following: [] },
      { followers: [u('x')], following: [] },
      { since: 1, at: 2 }
    );
    const data: CachedData = {
      network: { followers: [], following: [] },
      ghosts: [],
      ignoredLogins: ['spam'],
      lastDiff,
      timestamp: 2,
      metadata: {
        totalConnections: 0,
        fetchDuration: 0,
        cacheVersion: '3.0',
      },
    };
    const restored = decodeCache(JSON.parse(JSON.stringify(encodeCache(data))));
    expect(restored?.ignoredLogins).toEqual(['spam']);
    expect(restored?.lastDiff).toEqual(lastDiff);
  });
});
