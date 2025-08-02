import { create } from 'zustand';
import { GraphQLClient } from 'graphql-request';
import { toast } from 'sonner';
import { getNonMutuals } from '@/lib/utils';
import { findCacheGist, parseCache, writeCache } from '@/lib/gist';
import { fetchAllUserFollowersAndFollowing } from '@/lib/gql/fetchers';
import {
  GIST_ID_STORAGE_KEY,
  STALE_TIME_LARGE,
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
  gistId: string | null;
  metadata: CachedData['metadata'] | null;
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
  loadFromCache: (cachedData: CachedData) => void;
  setGistId: (gistId: string | null) => void;
};

export type CacheStore = CacheStoreState & CacheStoreActions;

const initialState: CacheStoreState = {
  network: { followers: [], following: [] },
  nonMutuals: { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] },
  ghosts: [],
  ghostsSet: new Set(),
  timestamp: null,
  isCheckingGhosts: false,
  gistId: null,
  metadata: null,
};

export const useCacheStore = create<CacheStore>((set, get) => ({
  ...initialState,

  setGistId: (gistId) => {
    if (gistId) {
      window.localStorage.setItem(GIST_ID_STORAGE_KEY, gistId);
    } else {
      window.localStorage.removeItem(GIST_ID_STORAGE_KEY);
    }
    set({ gistId });
  },

  loadFromCache: (cachedData) => {
    set({
      ...cachedData,
      nonMutuals: getNonMutuals(cachedData.network),
    });
  },

  initializeAndFetchNetwork: async (
    client,
    username,
    accessToken,
    progress
  ) => {
    const { show, update, complete, fail } = progress;
    const storedGistId = window.localStorage.getItem(GIST_ID_STORAGE_KEY);
    set({ gistId: storedGistId });

    const foundGist = await findCacheGist(client, storedGistId);
    console.log('foundGist', foundGist);
    if (foundGist) {
      const cachedData = parseCache(foundGist);
      if (cachedData) {
        const totalConnections = cachedData.metadata.totalConnections;
        let staleTime = 0;

        if (totalConnections < 2000) staleTime = STALE_TIME_SMALL;
        else if (totalConnections < 10000) staleTime = STALE_TIME_MEDIUM;
        else staleTime = STALE_TIME_LARGE;

        const isStale = Date.now() - cachedData.timestamp > staleTime;
        // If cache is NOT stale, return it immediately.
        if (!isStale) {
          console.log('Cache is fresh, returning data.');
          toast.info('Loaded fresh data from cache.');
          get().loadFromCache(cachedData);
          return cachedData.network;
        }
        // If it is stale, proceed to network fetch.
        toast.warning('Cache is stale, fetching fresh data...');
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

      const newGist = await writeCache(accessToken, dataToCache, get().gistId);
      set({
        network,
        timestamp,
        nonMutuals: getNonMutuals(network),
        metadata: dataToCache.metadata,
      });
      get().setGistId(newGist.id);

      complete();
      toast.success('Successfully synced and cached your network!');

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

  setGhosts: async (ghosts, accessToken) => {
    set({ ghosts, ghostsSet: new Set(ghosts.map(g => g.login)), isCheckingGhosts: false });
    const { network, timestamp, metadata, gistId } = get();

    if (!metadata || !timestamp || !network) return;

    const dataToCache: CachedData = {
      network,
      ghosts,
      timestamp,
      metadata,
    };
    const newGist = await writeCache(accessToken, dataToCache, gistId);
    get().setGistId(newGist.id);
  },
}));
