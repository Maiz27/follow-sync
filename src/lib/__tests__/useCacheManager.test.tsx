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
  QUERY_KEY_USER_NETWORK,
  gistIdStorageKey,
} from '@/lib/constants';
import { getQueryClient } from '@/app/get-query-client';
import { enqueuePersist } from '@/lib/persistenceQueue';
import { useGistStore } from '@/lib/store/gist';
import { useNetworkStore } from '@/lib/store/network';
import { useGhostStore } from '@/lib/store/ghost';
import { useIgnoreStore } from '@/lib/store/ignore';
import { useSettingsStore } from '@/lib/store/settings';
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
  useIgnoreStore.setState({ ignoredLogins: new Set() });
  useSettingsStore.setState({
    showAvatars: true,
    paginationPageSize: 100,
    customStaleTime: null,
  });
  getQueryClient().clear();
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

describe('useCacheManager: switching accounts in the same tab', () => {
  const aliceDiff = {
    since: 1,
    at: 2,
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

  /** Alice's dashboard, loaded from her cache and then used for a while. */
  const signInAsAlice = async () => {
    mocks.session.login = 'alice';
    const aliceCache = cacheData('alice', {
      ignoredLogins: ['spam'],
      removedGhosts: ['oldghost'],
      lastDiff: aliceDiff,
      settings: {
        showAvatars: false,
        paginationPageSize: 50,
        customStaleTime: null,
      },
    });
    mocks.findCanonicalCacheGist.mockResolvedValueOnce(
      discovery(gistFor(aliceCache, 'alice'), 'alice')
    );
    const { result } = renderHook(() => useCacheManager());
    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'alice',
        progress()
      );
    });
    expect(useGistStore.getState().gistName).toBe('G1');
    expect(mocks.writeCache).not.toHaveBeenCalled();

    // A follow and an unfollow that haven't settled yet, and a
    // duplicate-cache warning.
    useNetworkStore.getState().optimisticFollow(user('crush'));
    const unfollow = useNetworkStore
      .getState()
      .optimisticUnfollow(user('friend'));
    useGistStore.getState().setDuplicateGistCount(2);
    return { unfollow };
  };

  const signInAsBob = async () => {
    mocks.session.login = 'bob';
    mocks.findCanonicalCacheGist.mockResolvedValueOnce(discovery(null, 'bob'));
    mocks.fetchAndClassifyNetwork.mockResolvedValueOnce(
      fetched({
        viewerLogin: 'bob',
        followers: [user('bobfan')],
        following: [],
      })
    );
    mocks.writeCache.mockResolvedValueOnce({ id: 'GB', name: 'GB', files: [] });
    const { result } = renderHook(() => useCacheManager());
    await act(async () => {
      await result.current.initializeAndFetchNetwork(client, 'bob', progress());
    });
  };

  it("never carries the previous account's state into the next account's cache", async () => {
    window.localStorage.setItem(gistIdStorageKey('alice'), 'G1');
    await signInAsAlice();
    await signInAsBob();

    // Bob's discovery isn't pointed at Alice's gist...
    expect(mocks.findCanonicalCacheGist).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerLogin: 'bob', preferredGistId: null })
    );
    // ...and his first write neither targets it nor carries her data.
    expect(mocks.writeCache).toHaveBeenCalledTimes(1);
    const [written, gistId, options] = mocks.writeCache.mock.calls[0];
    expect(gistId).toBeNull();
    expect(options).toMatchObject({ discoverCanonicalFallback: true });
    expect(written).toMatchObject({
      network: { followers: [user('bobfan')], following: [] },
      ignoredLogins: [],
      removedGhosts: [],
      lastDiff: null,
      settings: { showAvatars: true },
      metadata: { ownerLogin: 'bob' },
    });

    expect(useGistStore.getState()).toMatchObject({
      ownerLogin: 'bob',
      gistName: 'GB',
      duplicateGistCount: 0,
      lastDiff: null,
    });
    expect(useNetworkStore.getState().pendingOps).toEqual([]);
    expect(useIgnoreStore.getState().ignoredLogins.size).toBe(0);
    expect(window.localStorage.getItem(gistIdStorageKey('alice'))).toBe('G1');
    expect(window.localStorage.getItem(gistIdStorageKey('bob'))).toBe('GB');
  });

  it("does not let the previous account's in-flight change touch the next account's network", async () => {
    const { unfollow } = await signInAsAlice();
    await signInAsBob();

    // Alice's unfollow fails after the switch: undoing it must not add her
    // friend to Bob's list.
    unfollow.rollback();

    expect(useNetworkStore.getState().network).toEqual({
      followers: [user('bobfan')],
      following: [],
    });
  });

  it("drops the previous account's network query so switching back reloads it", async () => {
    const queryClient = getQueryClient();
    queryClient.setQueryData([QUERY_KEY_USER_NETWORK, 'alice'], { a: 1 });
    queryClient.setQueryData([QUERY_KEY_USER_NETWORK, 'bob'], { b: 1 });

    await signInAsAlice();
    await signInAsBob();

    expect(
      queryClient.getQueryData([QUERY_KEY_USER_NETWORK, 'alice'])
    ).toBeUndefined();
    expect(queryClient.getQueryData([QUERY_KEY_USER_NETWORK, 'bob'])).toEqual({
      b: 1,
    });
  });

  it('does not report a diff against a snapshot of another account', async () => {
    await signInAsAlice();
    // Even if a previous account's sync time survived somehow.
    useGistStore.setState({ ownerLogin: 'bob', syncedAt: 1 });
    await signInAsBob();

    expect(useGistStore.getState().lastDiff).toBeNull();
    expect(lastWrite().lastDiff).toBeNull();
  });
});

describe('useCacheManager: superseded loads', () => {
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };

  const startBobSync = (result: {
    current: ReturnType<typeof useCacheManager>;
  }) => {
    mocks.session.login = 'bob';
    mocks.findCanonicalCacheGist.mockResolvedValueOnce(discovery(null, 'bob'));
    mocks.fetchAndClassifyNetwork.mockResolvedValueOnce(
      fetched({
        viewerLogin: 'bob',
        followers: [user('bobfan')],
        following: [],
      })
    );
    return result.current.initializeAndFetchNetwork(client, 'bob', progress());
  };

  it('does not hydrate the stores or remember its gist after a newer sync took over during the migration write', async () => {
    // Alice's cache needs relabelling, so loading it writes it first.
    const aliceCache = cacheData('alice');
    const aliceGist = {
      ...gistFor(aliceCache, 'alice'),
      description: 'follow-sync cache (old format)',
    };
    mocks.findCanonicalCacheGist.mockResolvedValueOnce(
      discovery(aliceGist, 'alice')
    );
    const migration = deferred<{ id: string; name: string; files: [] }>();
    mocks.writeCache
      .mockImplementationOnce(() => migration.promise)
      .mockImplementationOnce(async () => ({
        id: 'GB',
        name: 'GB',
        files: [],
      }));
    mocks.session.login = 'alice';
    const { result } = renderHook(() => useCacheManager());

    let aliceRun: Promise<unknown> = Promise.resolve();
    let bobRun: Promise<unknown> = Promise.resolve();
    await act(async () => {
      aliceRun = result.current
        .initializeAndFetchNetwork(client, 'alice', progress())
        .catch((error: unknown) => error);
      await vi.waitFor(() => expect(mocks.writeCache).toHaveBeenCalledTimes(1));

      // Bob signs in (another tab) while Alice's migration write is running.
      bobRun = startBobSync(result);
      await vi.waitFor(() =>
        expect(mocks.fetchAndClassifyNetwork).toHaveBeenCalled()
      );
      migration.resolve({ id: 'G1', name: 'G1', files: [] });
      await bobRun;
    });

    expect(await aliceRun).toMatchObject({ name: 'AbortError' });
    // Bob's cache write didn't go to Alice's gist...
    expect(mocks.writeCache).toHaveBeenCalledTimes(2);
    expect(mocks.writeCache.mock.calls[1][1]).toBeNull();
    // ...and nothing of Alice's landed in Bob's stores or storage key.
    expect(useGistStore.getState()).toMatchObject({
      ownerLogin: 'bob',
      gistName: 'GB',
    });
    expect(window.localStorage.getItem(gistIdStorageKey('bob'))).toBe('GB');
    expect(useNetworkStore.getState().network.followers).toEqual([
      user('bobfan'),
    ]);
  });

  it('drops a queued cache write of a sync that was superseded before it ran', async () => {
    // Hold the write queue so Alice's write is still queued when Bob starts.
    const blocker = deferred<void>();
    void enqueuePersist(() => blocker.promise);

    mocks.session.login = 'alice';
    mocks.findCanonicalCacheGist.mockResolvedValueOnce(
      discovery(null, 'alice')
    );
    mocks.fetchAndClassifyNetwork.mockResolvedValueOnce(
      fetched({ viewerLogin: 'alice' })
    );
    const aliceProgress = progress();
    const { result } = renderHook(() => useCacheManager());

    let aliceRun: Promise<unknown> = Promise.resolve();
    await act(async () => {
      aliceRun = result.current
        .initializeAndFetchNetwork(client, 'alice', aliceProgress)
        .catch((error: unknown) => error);
      await vi.waitFor(() =>
        expect(mocks.fetchAndClassifyNetwork).toHaveBeenCalledTimes(1)
      );
      const bobRun = startBobSync(result);
      await vi.waitFor(() =>
        expect(mocks.fetchAndClassifyNetwork).toHaveBeenCalledTimes(2)
      );
      blocker.resolve();
      await bobRun;
    });

    expect(await aliceRun).toMatchObject({ name: 'AbortError' });
    expect(aliceProgress.complete).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(mocks.writeCache).toHaveBeenCalledTimes(1);
    expect(lastWrite().metadata.ownerLogin).toBe('bob');
  });
});

describe('useCacheManager: plain writes', () => {
  it('looks for an existing cache gist before creating one when no gist id is known', async () => {
    // The sync's own cache write failed, so no gist id is known yet.
    mocks.findCanonicalCacheGist.mockResolvedValue(discovery(null));
    mocks.fetchAndClassifyNetwork.mockResolvedValue(fetched());
    mocks.writeCache.mockRejectedValueOnce(new Error('gist API down'));
    const { result } = renderHook(() => useCacheManager());
    await act(async () => {
      await result.current.initializeAndFetchNetwork(
        client,
        'octocat',
        progress()
      );
    });
    expect(useGistStore.getState().gistName).toBeNull();

    await act(async () => {
      await result.current.persistChanges();
    });

    expect(mocks.writeCache).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ ownerLogin: 'octocat' }),
      }),
      null,
      expect.objectContaining({ discoverCanonicalFallback: true })
    );
  });

  it('updates the known gist directly', async () => {
    useGistStore.setState({
      ownerLogin: 'octocat',
      gistName: 'G1',
      metadata: cacheData('octocat').metadata,
    });
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      await result.current.persistChanges();
    });

    expect(mocks.writeCache).toHaveBeenLastCalledWith(
      expect.anything(),
      'G1',
      expect.objectContaining({ discoverCanonicalFallback: false })
    );
  });
});

describe('useCacheManager: duplicate cleanup', () => {
  it('runs in the write queue so no write targets a gist it just deleted', async () => {
    // The remembered gist turns out to be a duplicate of the canonical one.
    useGistStore.setState({
      ownerLogin: 'octocat',
      gistName: 'DUP',
      metadata: cacheData('octocat').metadata,
    });
    let finishCleanup!: () => void;
    mocks.cleanupDuplicateCacheGists.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCleanup = () =>
            resolve({
              canonicalGist: { id: 'CANON', name: 'CANON', files: [] },
              deletedCount: 1,
              remainingDuplicateCount: 0,
            });
        })
    );
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      const cleanup = result.current.cleanupDuplicateCaches();
      await vi.waitFor(() =>
        expect(mocks.cleanupDuplicateCacheGists).toHaveBeenCalled()
      );
      // A follow lands while the duplicates are being deleted.
      const write = result.current.persistChanges();
      await Promise.resolve();
      expect(mocks.writeCache).not.toHaveBeenCalled();

      finishCleanup();
      await cleanup;
      await write;
    });

    expect(mocks.writeCache).toHaveBeenCalledTimes(1);
    expect(mocks.writeCache.mock.calls[0][1]).toBe('CANON');
    expect(useGistStore.getState().gistName).toBe('G1');
    expect(window.localStorage.getItem(gistIdStorageKey('octocat'))).toBe('G1');
  });

  it('waits for queued writes before scanning for duplicates', async () => {
    useGistStore.setState({
      ownerLogin: 'octocat',
      gistName: 'G1',
      metadata: cacheData('octocat').metadata,
    });
    let finishWrite!: () => void;
    mocks.writeCache.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWrite = () => resolve({ id: 'G1', name: 'G1', files: [] });
        })
    );
    mocks.cleanupDuplicateCacheGists.mockResolvedValue({
      canonicalGist: { id: 'G1', name: 'G1', files: [] },
      deletedCount: 0,
      remainingDuplicateCount: 0,
    });
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      const write = result.current.persistChanges();
      await vi.waitFor(() => expect(mocks.writeCache).toHaveBeenCalled());
      const cleanup = result.current.cleanupDuplicateCaches();
      await Promise.resolve();
      expect(mocks.cleanupDuplicateCacheGists).not.toHaveBeenCalled();

      finishWrite();
      await write;
      await cleanup;
    });

    expect(mocks.cleanupDuplicateCacheGists).toHaveBeenCalledWith(
      expect.objectContaining({ preferredGistId: 'G1' })
    );
  });
});

describe('useCacheManager: reloading the cache in the same session', () => {
  it('keeps in-flight and recent changes when the cache is served again', async () => {
    const cached = cacheData('octocat', { ghosts: [user('ghosty')] });
    mocks.findCanonicalCacheGist.mockResolvedValue(
      discovery(gistFor(cached, 'octocat'))
    );
    const load = async () => {
      // A fresh hook, as after a remount once React Query dropped the query.
      const { result } = renderHook(() => useCacheManager());
      await act(async () => {
        await result.current.initializeAndFetchNetwork(
          client,
          'octocat',
          progress()
        );
      });
    };
    await load();

    // Changes whose cache write hasn't landed in the gist yet.
    const pendingFollow = useNetworkStore
      .getState()
      .optimisticFollow(user('buddy'));
    useNetworkStore.getState().optimisticUnfollow(user('friend')).commit();
    useGhostStore.getState().optimisticRemoveGhost('ghosty');

    await load();

    expect(mocks.fetchAndClassifyNetwork).not.toHaveBeenCalled();
    expect(
      useNetworkStore.getState().network.following.map((u) => u.login)
    ).toEqual(['buddy']);
    expect(useGhostStore.getState().ghosts).toEqual([]);
    expect(useGhostStore.getState().removedGhostLogins.has('ghosty')).toBe(
      true
    );

    // The in-flight follow can still be undone on its own.
    pendingFollow.rollback();
    expect(useNetworkStore.getState().network.following).toEqual([]);
  });
});

describe('useCacheManager: cache version bump', () => {
  it('serves a fresh 3.0 cache without resyncing, and writes the current version next', async () => {
    const data = cacheData('octocat');
    const legacy = {
      ...data,
      metadata: { ...data.metadata, cacheVersion: '3.0' },
    };
    mocks.findCanonicalCacheGist.mockResolvedValue(
      discovery(gistFor(legacy, 'octocat'))
    );
    const { result } = renderHook(() => useCacheManager());

    let network: unknown;
    await act(async () => {
      network = await result.current.initializeAndFetchNetwork(
        client,
        'octocat',
        progress()
      );
    });

    expect(mocks.fetchAndClassifyNetwork).not.toHaveBeenCalled();
    expect(network).toEqual(legacy.network);

    await act(async () => {
      await result.current.persistChanges();
    });
    expect(lastWrite().metadata.cacheVersion).toBe(GIST_CACHE_VERSION);
  });
});

describe('useCacheManager: writes merged with another device', () => {
  it('shows what the merge brought in from the other device', async () => {
    useGistStore.setState({
      ownerLogin: 'octocat',
      gistName: 'G1',
      metadata: cacheData('octocat').metadata,
    });
    useIgnoreStore.getState().setIgnoredLogins(['mine']);
    mocks.writeCache.mockImplementation(
      async (
        data: CachedData,
        _gistId: string,
        options: { onMerged?: (merged: CachedData) => void }
      ) => {
        options.onMerged?.({
          ...data,
          ignoredLogins: ['mine', 'theirs'],
        });
        return { id: 'G1', name: 'G1', files: [] };
      }
    );
    const { result } = renderHook(() => useCacheManager());

    await act(async () => {
      await result.current.persistChanges();
    });

    expect([...useIgnoreStore.getState().ignoredLogins].sort()).toEqual([
      'mine',
      'theirs',
    ]);
  });
});
