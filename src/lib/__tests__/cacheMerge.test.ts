import { describe, expect, it } from 'vitest';

import { isSameRevision, mergeCacheData, toCacheBase } from '@/lib/cacheMerge';
import type { CachedData, NetworkUser } from '@/lib/types';

const user = (login: string): NetworkUser => ({
  __typename: 'User',
  id: `id-${login}`,
  login,
  name: null,
  avatarUrl: '',
  url: `https://github.com/${login}`,
  followers: { totalCount: 0 },
  following: { totalCount: 0 },
  accountType: 'user',
});

const snapshot = ({
  followers = ['fan'],
  following = ['a', 'b'],
  ghosts = [] as string[],
  removedGhosts = [] as string[],
  ignoredLogins = [] as string[],
  syncedAt = 100,
  timestamp = syncedAt,
  showAvatars = true,
}: {
  followers?: string[];
  following?: string[];
  ghosts?: string[];
  removedGhosts?: string[];
  ignoredLogins?: string[];
  syncedAt?: number;
  timestamp?: number;
  showAvatars?: boolean;
} = {}): CachedData => ({
  network: {
    followers: followers.map(user),
    following: following.map(user),
  },
  ghosts: ghosts.map(user),
  removedGhosts,
  ignoredLogins,
  settings: { showAvatars, paginationPageSize: 100, customStaleTime: null },
  lastDiff: null,
  timestamp,
  syncedAt,
  metadata: {
    totalConnections: followers.length + following.length,
    fetchDuration: 1,
    cacheVersion: '4.0',
    ownerLogin: 'octocat',
    cacheKey: 'follow-sync:octocat:network-cache',
  },
});

const REV = { version: 'v1', generation: 'g1' };

const logins = (users: NetworkUser[]) => users.map((u) => u.login).sort();

describe('mergeCacheData', () => {
  const base = toCacheBase(REV, snapshot());

  it('keeps follows and unfollows made on both devices', () => {
    // Remote unfollowed b and followed c; local followed d. Neither synced.
    const remote = snapshot({ following: ['a', 'c'], timestamp: 200 });
    const local = snapshot({ following: ['a', 'b', 'd'], timestamp: 300 });

    const merged = mergeCacheData(base, remote, local);

    expect(logins(merged.network.following)).toEqual(['a', 'c', 'd']);
    expect(merged.metadata.totalConnections).toBe(4);
  });

  it('prefers the network of the newer sync and re-applies local changes', () => {
    const remote = snapshot({
      followers: ['fan', 'newfan'],
      following: ['a', 'b', 'e'],
      syncedAt: 500,
    });
    const local = snapshot({ following: ['a'], timestamp: 600 }); // unfollowed b

    const merged = mergeCacheData(base, remote, local);

    expect(logins(merged.network.followers)).toEqual(['fan', 'newfan']);
    expect(logins(merged.network.following)).toEqual(['a', 'e']);
    expect(merged.syncedAt).toBe(500);
    expect(merged.timestamp).toBe(600);
  });

  it("does not replay the older side's sync over a newer one", () => {
    // Both re-synced since base; local's is newer and authoritative.
    const remote = snapshot({ following: ['a', 'b', 'x'], syncedAt: 300 });
    const local = snapshot({ following: ['a'], syncedAt: 400 });

    const merged = mergeCacheData(base, remote, local);

    expect(logins(merged.network.following)).toEqual(['a']);
  });

  it('merges ignore lists by what each side added and removed', () => {
    const ignoredBase = toCacheBase(
      REV,
      snapshot({ ignoredLogins: ['keep', 'dropLocal', 'dropRemote'] })
    );
    const remote = snapshot({
      ignoredLogins: ['keep', 'dropLocal', 'addRemote'],
    });
    const local = snapshot({
      ignoredLogins: ['keep', 'dropRemote', 'addLocal'],
    });

    const merged = mergeCacheData(ignoredBase, remote, local);

    expect([...(merged.ignoredLogins ?? [])].sort()).toEqual(
      ['addlocal', 'addremote', 'keep'].sort()
    );
  });

  it('unions ghost removals and hides removed ghosts', () => {
    const remote = snapshot({
      ghosts: ['g1', 'g2'],
      removedGhosts: ['g1'],
      syncedAt: 200,
    });
    const local = snapshot({ ghosts: ['g2'], removedGhosts: ['g2'] });

    const merged = mergeCacheData(base, remote, local);

    expect([...(merged.removedGhosts ?? [])].sort()).toEqual(['g1', 'g2']);
    expect(merged.ghosts).toEqual([]);
  });

  it('keeps a tombstone pruned on one side since the base pruned', () => {
    // Both started with g1 removed; a sync on the remote device no longer
    // saw g1 followed and dropped its tombstone. Local removed g2 since.
    const tombstoneBase = toCacheBase(REV, snapshot({ removedGhosts: ['g1'] }));
    const remote = snapshot({ removedGhosts: [], syncedAt: 200 });
    const local = snapshot({ removedGhosts: ['g1', 'g2'] });

    expect(
      [
        ...(mergeCacheData(tombstoneBase, remote, local).removedGhosts ?? []),
      ].sort()
    ).toEqual(['g2']);
    // And the other way round.
    expect(
      [
        ...(mergeCacheData(tombstoneBase, local, remote).removedGhosts ?? []),
      ].sort()
    ).toEqual(['g2']);
  });

  it('unions tombstones without a base', () => {
    const remote = snapshot({ removedGhosts: [] });
    const local = snapshot({ removedGhosts: ['G1'] });

    expect(mergeCacheData(null, remote, local).removedGhosts).toEqual(['g1']);
  });

  it('keeps local settings: this write is the latest action', () => {
    const merged = mergeCacheData(
      base,
      snapshot({ showAvatars: true }),
      snapshot({ showAvatars: false })
    );
    expect(merged.settings?.showAvatars).toBe(false);
  });
});

describe('mergeCacheData without a base (this session never read the gist)', () => {
  it('keeps the network of the newer sync whole', () => {
    const remote = snapshot({
      followers: ['fan', 'newfan'],
      following: ['a', 'c'],
      syncedAt: 500,
    });
    const local = snapshot({ following: ['a', 'b', 'd'], syncedAt: 400 });

    const merged = mergeCacheData(null, remote, local);

    expect(logins(merged.network.followers)).toEqual(['fan', 'newfan']);
    expect(logins(merged.network.following)).toEqual(['a', 'c']);
    expect(merged.syncedAt).toBe(500);
  });

  it('keeps a fresh local sync over an older remote one', () => {
    const remote = snapshot({ following: ['a', 'c'], syncedAt: 100 });
    const local = snapshot({ following: ['a', 'b'], syncedAt: 900 });

    const merged = mergeCacheData(null, remote, local);

    expect(logins(merged.network.following)).toEqual(['a', 'b']);
    expect(merged.syncedAt).toBe(900);
  });

  it('never drops an ignore or a ghost removal made on either side', () => {
    const remote = snapshot({
      ignoredLogins: ['Theirs', 'both'],
      ghosts: ['g1', 'g2'],
      removedGhosts: ['g1'],
      syncedAt: 100,
    });
    const local = snapshot({
      ignoredLogins: ['mine', 'both'],
      ghosts: ['g1', 'g2'],
      removedGhosts: ['g2'],
      syncedAt: 900,
    });

    const merged = mergeCacheData(null, remote, local);

    expect([...(merged.ignoredLogins ?? [])].sort()).toEqual([
      'both',
      'mine',
      'theirs',
    ]);
    expect([...(merged.removedGhosts ?? [])].sort()).toEqual(['g1', 'g2']);
    expect(merged.ghosts).toEqual([]);
  });

  it("never takes the network of a cache this code can't serve", () => {
    const remote = snapshot({
      following: ['old'],
      ignoredLogins: ['theirs'],
      syncedAt: 900,
    });
    remote.metadata = { ...remote.metadata, cacheVersion: '2.0' };
    const local = snapshot({ following: ['a'], syncedAt: 100 });

    const merged = mergeCacheData(null, remote, local);

    expect(logins(merged.network.following)).toEqual(['a']);
    expect(merged.ignoredLogins).toEqual(['theirs']);
  });
});

describe('isSameRevision', () => {
  it('compares cache generations when both sides have one', () => {
    expect(
      isSameRevision(
        { version: 'a', generation: 'g1' },
        { version: 'b', generation: 'g1' }
      )
    ).toBe(true);
    expect(
      isSameRevision(
        { version: 'a', generation: 'g1' },
        { version: 'a', generation: 'g2' }
      )
    ).toBe(false);
  });

  it('treats a cache appearing or disappearing as a change', () => {
    expect(
      isSameRevision(
        { version: 'a', generation: null },
        { version: 'a', generation: 'g1' }
      )
    ).toBe(false);
  });

  it('falls back to history versions without generations, and never matches unknown', () => {
    expect(
      isSameRevision(
        { version: 'a', generation: null },
        { version: 'a', generation: null }
      )
    ).toBe(true);
    expect(
      isSameRevision(
        { version: null, generation: null },
        { version: null, generation: null }
      )
    ).toBe(false);
    expect(isSameRevision(null, { version: 'b', generation: 'g' })).toBe(false);
  });
});
