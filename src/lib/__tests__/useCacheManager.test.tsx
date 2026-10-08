// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { GraphQLClient } from 'graphql-request';

const mocks = vi.hoisted(() => ({
  session: { login: 'octocat' },
  findCanonicalCacheGist: vi.fn(),
  writeCache: vi.fn(),
  cleanupDuplicateCacheGists: vi.fn(),
  fetchAndClassifyNetwork: vi.fn(),
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: { user: { login: mocks.session.login } },
  }),
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/lib/networkSync', () => ({
  fetchAndClassifyNetwork: mocks.fetchAndClassifyNetwork,
}));
vi.mock('@/lib/gist', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gist')>()),
  findCanonicalCacheGist: mocks.findCanonicalCacheGist,
  writeCache: mocks.writeCache,
  cleanupDuplicateCacheGists: mocks.cleanupDuplicateCacheGists,
}));

import { useCacheManager } from '@/lib/hooks/useCacheManager';
import { buildCacheDescription, serializeCache } from '@/lib/gist';
import { encodeCache } from '@/lib/cacheCodec';
import {
  GIST_CACHE_VERSION,
  GIST_FILENAME,
  LEGACY_GIST_ID_STORAGE_KEY,
  gistIdStorageKey,
} from '@/lib/constants';
import { useGistStore } from '@/lib/store/gist';
import { useNetworkStore } from '@/lib/store/network';
import { useGhostStore } from '@/lib/store/ghost';
import type { CacheGist, CachedData, NetworkUser } from '@/lib/types';

const client = new GraphQLClient('https://example.test/graphql');

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

const cacheData = (
  ownerLogin: string,
  overrides: Partial<CachedData> = {}
): CachedData => ({
  network: { followers: [user('fan')], following: [user('friend')] },
  ghosts: [],
  removedGhosts: [],
  timestamp: Date.now(),
  ...overrides,
  metadata: {
    totalConnections: 2,
    fetchDuration: 1,
    cacheVersion: GIST_CACHE_VERSION,
    ownerLogin,
    cacheKey: `follow-sync:${ownerLogin}:network-cache`,
  },
});

const gistFor = (data: CachedData, ownerLogin: string): CacheGist => ({
  id: 'G1',
  name: 'G1',
  ownerLogin,
  description: buildCacheDescription(data.metadata.ownerLogin ?? ownerLogin),
  updatedAt: '2024-01-01T00:00:00Z',
  files: [{ name: GIST_FILENAME, text: serializeCache(encodeCache(data)) }],
});

const discovery = (gist: CacheGist | null, resolvedOwnerLogin = 'octocat') => ({
  canonicalGist: gist,
  duplicateGists: [],
  scannedAll: false,
  resolvedOwnerLogin,
});

const progress = () => ({
  show: vi.fn(),
  update: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
});

const fetched = ({
  viewerLogin = 'octocat',
  followers = [user('fan')],
  following = [user('friend')],
}: {
  viewerLogin?: string;
  followers?: NetworkUser[];
  following?: NetworkUser[];
} = {}) => ({
  viewerLogin,
  followers,
  following,
  ghosts: [],
  graphqlFollowingLogins: new Set<string>(),
});

/** The last payload handed to writeCache. */
const lastWrite = (): CachedData =>
  mocks.writeCache.mock.calls.at(-1)?.[0] as CachedData;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  window.localStorage.clear();
  mocks.session.login = 'octocat';
  useGistStore.setState({
    timestamp: null,
    syncedAt: null,
    gistName: null,
    ownerLogin: null,
    viewerLogin: null,
    metadata: null,
    duplicateGistCount: 0,
    forceNextRefresh: false,
    lastDiff: null,
  });
  useNetworkStore.setState({
    network: { followers: [], following: [] },
    nonMutuals: { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] },
    pendingOps: [],
  });
  useGhostStore.setState({
    ghosts: [],
    ghostsSet: new Set(),
    removedGhostLogins: new Set(),
  });
  mocks.writeCache.mockImplementation(async () => ({
    id: 'G1',
    name: 'G1',
    files: [],
  }));
});

describe('useCacheManager: renamed accounts', () => {
  it('labels the synced cache with the login GitHub reports, not a stale session login', async () => {
    mocks.session.login = 'oldname';
    mocks.findCanonicalCacheGist.mockResolvedValue(discovery(null, 'oldname'));
    mocks.fetchAndClassifyNetwork.mockResolvedValue(
      fetched({ viewerLogin: 'NewName' })
    );
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'oldname',
        progress()
      );
    });

    expect(lastWrite().metadata.ownerLogin).toBe('newname');
    expect(lastWrite().metadata.cacheKey).toBe(
      'follow-sync:newname:network-cache'
    );

    // Later writes (follows, settings...) keep the current login too.
    await act(async () => {
      await result.current.persistChanges();
    });
    expect(lastWrite().metadata.ownerLogin).toBe('newname');
  });

  it('relabels a cache accepted under an older login of the same account', async () => {
    const data = cacheData('oldname');
    mocks.findCanonicalCacheGist.mockResolvedValue(
      discovery(gistFor(data, 'newname'), 'newname')
    );
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'newname',
        progress()
      );
    });

    expect(mocks.fetchAndClassifyNetwork).not.toHaveBeenCalled();
    expect(mocks.writeCache).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ ownerLogin: 'newname' }),
      }),
      'G1'
    );
  });
});

describe('useCacheManager: sync time vs write time', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('does not mark a stale cache as freshly synced when saving during a failed refresh', async () => {
    const syncedLongAgo = Date.now() - DAY;
    const stale = cacheData('octocat', { timestamp: syncedLongAgo });
    mocks.findCanonicalCacheGist.mockResolvedValue(
      discovery(gistFor(stale, 'octocat'))
    );
    mocks.fetchAndClassifyNetwork.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      await expect(
        result.current.initializeAndFetchNetwork(client, 'octocat', progress())
      ).rejects.toThrow('offline');
    });
    // The stale cache is shown while the refresh runs...
    expect(useGistStore.getState().syncedAt).toBe(syncedLongAgo);

    // ...and a follow/ignore/settings save meanwhile is just a write.
    await act(async () => {
      await result.current.persistChanges();
    });
    const written = lastWrite();
    expect(written.timestamp).toBeGreaterThan(syncedLongAgo);
    expect(written.syncedAt).toBe(syncedLongAgo);
    expect(useGistStore.getState().syncedAt).toBe(syncedLongAgo);

    // Loading that write again still counts as stale and syncs.
    mocks.findCanonicalCacheGist.mockResolvedValue(
      discovery(gistFor(written, 'octocat'))
    );
    mocks.fetchAndClassifyNetwork.mockResolvedValue(fetched());
    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'octocat',
        progress()
      );
    });
    expect(mocks.fetchAndClassifyNetwork).toHaveBeenCalledTimes(2);
  });

  it('records the sync time only when a full sync completes', async () => {
    mocks.findCanonicalCacheGist.mockResolvedValue(discovery(null));
    mocks.fetchAndClassifyNetwork.mockResolvedValue(fetched());
    const { result } = renderHook(() => useCacheManager());
    const before = Date.now();

    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'octocat',
        progress()
      );
    });

    expect(useGistStore.getState().syncedAt).toBeGreaterThanOrEqual(before);
    expect(lastWrite().syncedAt).toBe(useGistStore.getState().syncedAt);
  });

  it('falls back to the write timestamp for caches written before syncedAt', async () => {
    const fresh = cacheData('octocat', { timestamp: Date.now() - 1000 });
    mocks.findCanonicalCacheGist.mockResolvedValue(
      discovery(gistFor(fresh, 'octocat'))
    );
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'octocat',
        progress()
      );
    });

    expect(mocks.fetchAndClassifyNetwork).not.toHaveBeenCalled();
    expect(useGistStore.getState().syncedAt).toBe(fresh.timestamp);
  });
});

describe('useCacheManager: sync lifecycle', () => {
  it('shows rate-limit pauses in the sync progress toast', async () => {
    mocks.findCanonicalCacheGist.mockResolvedValue(discovery(null));
    mocks.fetchAndClassifyNetwork.mockImplementation(
      async ({
        onRateLimitPause,
      }: {
        onRateLimitPause?: (waitMs: number) => void;
      }) => {
        onRateLimitPause?.(42_000);
        return fetched();
      }
    );
    const callbacks = progress();
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'octocat',
        callbacks
      );
    });

    expect(callbacks.update).toHaveBeenCalledWith(
      expect.any(Array),
      'Rate limited by GitHub, resuming in 42s...'
    );
  });

  it('aborts a running sync when a newer one starts', async () => {
    mocks.findCanonicalCacheGist.mockResolvedValue(discovery(null));
    let firstSignal: AbortSignal | undefined;
    mocks.fetchAndClassifyNetwork.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) => {
        firstSignal = signal;
        return new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason))
        );
      }
    );
    mocks.fetchAndClassifyNetwork.mockResolvedValueOnce(
      fetched({ following: [user('newest')] })
    );
    const first = progress();
    const second = progress();
    const { result } = renderHook(() => useCacheManager());

    let firstRun: Promise<unknown> = Promise.resolve();
    await act(async () => {
      firstRun = result.current
        .initializeAndFetchNetwork(client, 'octocat', first)
        .catch((error: unknown) => error);
      await vi.waitFor(() => expect(firstSignal).toBeDefined());
      await result.current.initializeAndFetchNetwork(client, 'octocat', second);
    });

    expect(firstSignal?.aborted).toBe(true);
    expect(await firstRun).toMatchObject({ name: 'AbortError' });
    // The superseded sync neither fails the shared toast nor writes.
    expect(first.fail).not.toHaveBeenCalled();
    expect(second.complete).toHaveBeenCalled();
    expect(mocks.writeCache).toHaveBeenCalledTimes(1);
    expect(
      useNetworkStore.getState().network.following.map((u) => u.login)
    ).toEqual(['newest']);
  });
});

describe('useCacheManager: legacy gist id', () => {
  it('migrates the legacy global gist id to the account key before dropping it', async () => {
    window.localStorage.setItem(LEGACY_GIST_ID_STORAGE_KEY, 'LEGACY');
    mocks.findCanonicalCacheGist.mockResolvedValue(discovery(null));
    mocks.fetchAndClassifyNetwork.mockResolvedValue(fetched());
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'octocat',
        progress()
      );
    });

    // Still only a hint: discovery validates its ownership before use.
    expect(mocks.findCanonicalCacheGist).toHaveBeenCalledWith(
      expect.objectContaining({ preferredGistId: 'LEGACY' })
    );
    expect(window.localStorage.getItem(LEGACY_GIST_ID_STORAGE_KEY)).toBeNull();
  });

  it('keeps an existing account-scoped gist id over the legacy one', async () => {
    window.localStorage.setItem(LEGACY_GIST_ID_STORAGE_KEY, 'LEGACY');
    window.localStorage.setItem(gistIdStorageKey('octocat'), 'MINE');
    mocks.findCanonicalCacheGist.mockResolvedValue(discovery(null));
    mocks.fetchAndClassifyNetwork.mockResolvedValue(fetched());
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'octocat',
        progress()
      );
    });

    expect(mocks.findCanonicalCacheGist).toHaveBeenCalledWith(
      expect.objectContaining({ preferredGistId: 'MINE' })
    );
    expect(window.localStorage.getItem(LEGACY_GIST_ID_STORAGE_KEY)).toBeNull();
  });
});

describe('useCacheManager: changes since last sync', () => {
  const syncedAt = Date.now() - 24 * 60 * 60 * 1000;
  const oldDiff = {
    since: syncedAt - 1000,
    at: syncedAt,
    newFollowers: ['someone'],
    lostFollowers: [],
    newFollowing: [],
    removedFollowing: [],
    counts: {
      newFollowers: 1,
      lostFollowers: 0,
      newFollowing: 0,
      removedFollowing: 0,
    },
  };

  const runSync = async () => {
    const { result } = renderHook(() => useCacheManager());
    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'octocat',
        progress()
      );
    });
  };

  beforeEach(() => {
    const stale = cacheData('octocat', {
      timestamp: syncedAt,
      lastDiff: oldDiff,
    });
    mocks.findCanonicalCacheGist.mockResolvedValue(
      discovery(gistFor(stale, 'octocat'))
    );
  });

  it('clears the previous diff when a sync finds no changes', async () => {
    mocks.fetchAndClassifyNetwork.mockResolvedValue(fetched());

    await runSync();

    expect(useGistStore.getState().lastDiff).toBeNull();
    expect(lastWrite().lastDiff).toBeNull();
  });

  it('records what changed since the previous full sync', async () => {
    mocks.fetchAndClassifyNetwork.mockResolvedValue(
      fetched({ followers: [user('fan'), user('newfan')] })
    );

    await runSync();

    expect(useGistStore.getState().lastDiff).toMatchObject({
      since: syncedAt,
      newFollowers: ['newfan'],
      removedFollowing: [],
    });
  });

  it('does not report an in-app follow made during the sync as an unfollow elsewhere', async () => {
    mocks.fetchAndClassifyNetwork.mockImplementation(async () => {
      // Followed in the app while GitHub was being read; the fetched list
      // predates it.
      useNetworkStore.getState().optimisticFollow(user('buddy')).commit();
      return fetched();
    });

    await runSync();

    expect(useGistStore.getState().lastDiff).toBeNull();
    expect(
      useNetworkStore.getState().network.following.map((u) => u.login)
    ).toEqual(['friend', 'buddy']);
  });
});
