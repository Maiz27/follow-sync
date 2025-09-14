import { GraphQLClient } from 'graphql-request';
import { toast } from 'sonner';

import { useNetworkStore } from '@/lib/store/network';
import { useGistStore } from '@/lib/store/gist';
import { useGhostStore } from '@/lib/store/ghost';
import { useSettingsStore } from '@/lib/store/settings';

import { findCacheGist, parseCache, writeCache } from '@/lib/gist';
import { fetchAllUserFollowersAndFollowing } from '@/lib/gql/fetchers';
import { ProgressCallbacks } from '@/lib/store/cache';
import {
  GIST_ID_STORAGE_KEY,
  STALE_TIME_LARGE,
  STALE_TIME_MANUAL_ONLY,
  STALE_TIME_MEDIUM,
  STALE_TIME_SMALL,
} from '@/lib/constants';
import { CachedData } from '@/lib/types';
import { UserInfoFragment } from '@/lib/gql/types';

export const useCacheManager = () => {
  const { setNetwork } = useNetworkStore.getState();
  const { setGhosts, addGhosts } = useGhostStore.getState();
  const {
    setGistName,
    setForceNextRefresh,
    forceNextRefresh,
    gistName,
    setGistData,
  } = useGistStore.getState();
  const settings = useSettingsStore.getState();

  const loadFromCache = (cachedData: CachedData) => {
    setNetwork(cachedData.network);
    setGhosts(cachedData.ghosts);
    setGistData({
      timestamp: cachedData.timestamp,
      metadata: cachedData.metadata,
    });

    if (cachedData.settings) {
      settings.setShowAvatars(cachedData.settings.showAvatars);
      settings.setGhostDetectionBatchSize(
        cachedData.settings.ghostDetectionBatchSize
      );
      settings.setPaginationPageSize(cachedData.settings.paginationPageSize);
      settings.setCustomStaleTime(cachedData.settings.customStaleTime);
    }
  };

  const initializeAndFetchNetwork = async (
    client: GraphQLClient,
    username: string,
    accessToken: string,
    progress: ProgressCallbacks
  ) => {
    const { show, update, complete, fail } = progress;
    const localGistName = window.localStorage.getItem(GIST_ID_STORAGE_KEY);
    setGistName(localGistName);

    if (forceNextRefresh) {
      setForceNextRefresh(false); // Reset the flag
    }

    if (!forceNextRefresh) {
      const foundGist = await findCacheGist(client, gistName);
      if (foundGist) {
        const cachedData = parseCache(foundGist);
        if (cachedData) {
          setGistName(foundGist.name);
          const totalConnections = cachedData.metadata.totalConnections;
          const { customStaleTime } = settings;

          let staleTime = 0;
          if (customStaleTime) {
            staleTime = customStaleTime * 60 * 1000;
          } else if (totalConnections < 2000) {
            staleTime = STALE_TIME_SMALL;
          } else if (totalConnections < 10000) {
            staleTime = STALE_TIME_MEDIUM;
          } else if (totalConnections < 50000) {
            staleTime = STALE_TIME_LARGE;
          } else {
            staleTime = STALE_TIME_MANUAL_ONLY;
          }

          const isStale = Date.now() - cachedData.timestamp > staleTime;
          loadFromCache(cachedData);

          if (!isStale) {
            toast.info('Loaded fresh data from cache.');
            return cachedData.network;
          }

          if (staleTime === STALE_TIME_MANUAL_ONLY) {
            toast.info(
              'Data loaded from cache. Refresh manually for the latest update.'
            );
            return cachedData.network;
          }
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
        settings,
        timestamp,
        metadata: {
          totalConnections: followers.length + following.length,
          fetchDuration,
          cacheVersion: '1.0',
        },
      };

      const newGist = await writeCache(accessToken, dataToCache, gistName);

      setNetwork(network);
      setGistData({ timestamp, metadata: dataToCache.metadata });
      setGistName(newGist.id);
      complete();

      return network;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      fail({ message: err.message || 'Failed to sync network.' });
      throw err;
    }
  };

  const persistChanges = async (accessToken: string) => {
    if (!accessToken) return;

    const { network } = useNetworkStore.getState();
    const { ghosts } = useGhostStore.getState();
    const { timestamp, metadata, gistName } = useGistStore.getState();
    const currentSettings = useSettingsStore.getState();

    if (!network || !timestamp || !metadata) return;

    const dataToCache: CachedData = {
      network,
      ghosts,
      timestamp,
      metadata,
      settings: currentSettings,
    };

    await writeCache(accessToken, dataToCache, gistName);
  };

  const updateGhosts = async (
    newGhosts: UserInfoFragment[],
    accessToken: string
  ) => {
    addGhosts(newGhosts);
    await persistChanges(accessToken);
  };

  return {
    initializeAndFetchNetwork,
    loadFromCache,
    persistChanges,
    updateGhosts,
  };
};
