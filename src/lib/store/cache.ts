import { create } from 'zustand';
import { GraphQLClient } from 'graphql-request';
import { toast } from 'sonner';
import { getNonMutuals } from '@/lib/utils';
import { findCacheGist, parseCache, writeCache } from '@/lib/gist';
import { fetchAllUserFollowersAndFollowing } from '@/lib/gql/fetchers';
import {
  GIST_ID_STORAGE_KEY,
  STALE_TIME_LARGE,
  STALE_TIME_MANUAL_ONLY,
  STALE_TIME_MEDIUM,
  STALE_TIME_SMALL,
} from '@/lib/constants';
import { UserInfoFragment } from '@/lib/gql/types';
import { CachedData } from '@/lib/types';

// Define the structure for progress callbacks to decouple from the hook
export interface ProgressCallbacks {
  show: (config: {
    title: string;
    message: string;
    items: { label: string; current: number; total: number }[];
  }) => void;
  update: (items: { label: string; current: number; total: number }[]) => void;
  complete: () => void;
  fail: (config: { message: string }) => void;
}

export type CacheStoreState = {
  network: {
    followers: UserInfoFragment[];
    following: UserInfoFragment[];
  };
  nonMutuals: {
    nonMutualsFollowingYou: UserInfoFragment[];
    nonMutualsYouFollow: UserInfoFragment[];
  };
  ghosts: UserInfoFragment[];
  ghostsSet: Set<string>;
  timestamp: number | null;
  isCheckingGhosts: boolean;
  gistName: string | null;
  metadata: CachedData['metadata'] | null;
  forceNextRefresh: boolean;
};

export type CacheStoreActions = {
  initializeAndFetchNetwork: (
    client: GraphQLClient,
    username: string,
    accessToken: string,
    progress: ProgressCallbacks
  ) => Promise<CacheStoreState['network']>;
  setGhosts: (ghosts: UserInfoFragment[], accessToken: string) => Promise<void>;
  isGhost: (login: string) => boolean;
  setIsCheckingGhosts: (isCheckingGhosts: boolean) => void;
  loadFromCache: (cachedData: CachedData) => void;
  setGistName: (gistName: string | null) => void;
  writeCache: (
    accessToken: string,
    data: CachedData,
    gistName: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<any>;
  getState: () => CacheStoreState;
  updateNetwork: (data: {
    network: CacheStoreState['network'];
    nonMutuals: CacheStoreState['nonMutuals'];
  }) => void;
  setForceNextRefresh: (force: boolean) => void;
};

export type CacheStore = CacheStoreState & CacheStoreActions;

const initialState: CacheStoreState = {
  network: { followers: [], following: [] },
  nonMutuals: { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] },
  ghosts: [],
  ghostsSet: new Set(),
  timestamp: null,
  isCheckingGhosts: true,
  gistName: null,
  metadata: null,
  forceNextRefresh: false,
};

export const useCacheStore = create<CacheStore>((set, get) => ({
  ...initialState,

  setGistName: (gistName) => {
    if (gistName) {
      window.localStorage.setItem(GIST_ID_STORAGE_KEY, gistName);
    }
    set({ gistName });
  },

  writeCache: async (accessToken, data, gistName) => {
    return await writeCache(accessToken, data, gistName);
  },

  getState: () => get(),

  loadFromCache: (cachedData) => {
    set({
      ...cachedData,
      nonMutuals: getNonMutuals(cachedData.network),
      ghostsSet: new Set(cachedData.ghosts.map((g) => g.login)),
    });
  },

  updateNetwork: (data) => {
    set({
      network: data.network,
      nonMutuals: data.nonMutuals,
    });
  },

  setForceNextRefresh: (force) => {
    set({ forceNextRefresh: force });
  },

  initializeAndFetchNetwork: async (
    client,
    username,
    accessToken,
    progress
  ) => {
    const { show, update, complete, fail } = progress;
    const gistName = window.localStorage.getItem(GIST_ID_STORAGE_KEY);
    set({ gistName });

    const forceRefresh = get().forceNextRefresh;
    if (forceRefresh) {
      get().setForceNextRefresh(false); // Reset the flag
    }

    if (!forceRefresh) {
      const foundGist = await findCacheGist(client, gistName);
      if (foundGist) {
        const cachedData = parseCache(foundGist);
        if (cachedData) {
          get().setGistName(foundGist.name);
          const totalConnections = cachedData.metadata.totalConnections;
          let staleTime = 0;

          if (totalConnections < 2000) {
            staleTime = STALE_TIME_SMALL;
          } else if (totalConnections < 10000) {
            staleTime = STALE_TIME_MEDIUM;
          } else if (totalConnections < 50000) {
            staleTime = STALE_TIME_LARGE;
          } else {
            staleTime = STALE_TIME_MANUAL_ONLY;
          }

          const isStale = Date.now() - cachedData.timestamp > staleTime;
          get().loadFromCache(cachedData);

          if (!isStale) {
            console.log('Cache is fresh, returning data.');
            toast.info('Loaded fresh data from cache.');
            return cachedData.network;
          }

          // For manual-only tier, show a different message
          if (staleTime === STALE_TIME_MANUAL_ONLY) {
            console.warn(
              'Cache is stale, but auto-refresh is disabled for large networks. Awaiting manual refresh.'
            );
            toast.info(
              'Data loaded from cache. Refresh manually for the latest update.'
            );
            return cachedData.network;
          }

          console.warn(
            'Cache is stale, fetching fresh data in the background...'
          );
        }
      }
    }

    const fetchStart = performance.now();
    show({
      title: 'Syncing Your Network',
      message: 'Fetching connections from GitHub...',
      items: [
        { label: 'Followers', current: 0, total: 0 },
        { label: 'Following', current: 0, total: 0 },
      ],
    });

    try {
      const networkData = await fetchAllUserFollowersAndFollowing({
        client,
        username,
        onProgress: (p) => {
          update([
            {
              label: 'Followers',
              current: p.fetchedFollowers,
              total: p.totalFollowers,
            },
            {
              label: 'Following',
              current: p.fetchedFollowing,
              total: p.totalFollowing,
            },
          ]);
        },
      });

      const fetchEnd = performance.now();
      const fetchDuration = Math.round((fetchEnd - fetchStart) / 1000);
      const followers = networkData.followers.nodes as UserInfoFragment[];
      const following = networkData.following.nodes as UserInfoFragment[];
      const network = { followers, following };
      const timestamp = Date.now();

      const dataToCache: CachedData = {
        network,
        ghosts: [],
        timestamp,
        metadata: {
          totalConnections: followers.length + following.length,
          fetchDuration,
          cacheVersion: '1.0',
        },
      };

      const newGist = await writeCache(
        accessToken,
        dataToCache,
        get().gistName
      );

      set({
        network,
        timestamp,
        nonMutuals: getNonMutuals(network),
        metadata: dataToCache.metadata,
      });

      get().setGistName(newGist.id);
      complete();

      return network;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      fail({ message: err.message || 'Failed to sync network.' });
      throw err;
    }
  },

  isGhost: (login) => {
    return get().ghostsSet.has(login);
  },

  setIsCheckingGhosts: (isCheckingGhosts) => {
    set({ isCheckingGhosts });
  },

  setGhosts: async (ghosts, accessToken) => {
    const allGhosts = [...get().ghosts, ...ghosts];
    const uniqueGhostsMap = new Map();
    allGhosts.forEach(g => uniqueGhostsMap.set(g.login, g));
    const uniqueGhosts = Array.from(uniqueGhostsMap.values());

    set({
      ghosts: uniqueGhosts,
      ghostsSet: new Set(uniqueGhosts.map((g) => g.login)),
      isCheckingGhosts: false,
    });

    const { network, timestamp, metadata, gistName } = get();

    if (!metadata || !timestamp || !network) return;

    const dataToCache: CachedData = {
      network,
      ghosts: uniqueGhosts,
      timestamp,
      metadata,
    };
    const newGist = await writeCache(accessToken, dataToCache, gistName);
    get().setGistName(newGist.name);
  },
}));
