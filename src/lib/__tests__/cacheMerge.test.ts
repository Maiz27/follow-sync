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

const REV = { version: 'v1', updatedAt: '2024-01-01T00:00:00Z' };

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

  it('keeps local settings: this write is the latest action', () => {
    const merged = mergeCacheData(
      base,
      snapshot({ showAvatars: true }),
      snapshot({ showAvatars: false })
    );
    expect(merged.settings?.showAvatars).toBe(false);
  });
});

describe('isSameRevision', () => {
  const at = '2024-01-01T00:00:00Z';
  it('compares history versions when both sides have one', () => {
    expect(
      isSameRevision(
        { version: 'a', updatedAt: at },
        { version: 'a', updatedAt: 'x' }
      )
    ).toBe(true);
    expect(
      isSameRevision(
        { version: 'a', updatedAt: at },
        { version: 'b', updatedAt: at }
      )
    ).toBe(false);
  });

  it('falls back to updated_at when a version is missing', () => {
    expect(
      isSameRevision(
        { version: null, updatedAt: at },
        { version: 'b', updatedAt: at }
      )
    ).toBe(true);
    expect(isSameRevision(null, { version: 'b', updatedAt: at })).toBe(false);
  });
});
