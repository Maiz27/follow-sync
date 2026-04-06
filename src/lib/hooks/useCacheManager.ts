import { GraphQLClient } from 'graphql-request';
import { toast } from 'sonner';
import { useCallback } from 'react';

import { useNetworkStore } from '@/lib/store/network';
import { useGistStore } from '@/lib/store/gist';
import { useGhostStore } from '@/lib/store/ghost';
import { useSettingsStore } from '@/lib/store/settings';

import {
  buildCacheKey,
  cleanupDuplicateCacheGists,
  findCanonicalCacheGist,
  getGistIdentifier,
  normalizeCachedData,
  parseCache,
  shouldMigrateCanonicalCache,
  writeCache,
} from '@/lib/gist';
import { fetchAllUserFollowersAndFollowing } from '@/lib/gql/fetchers';
import {
  GIST_CACHE_VERSION,
  GIST_ID_STORAGE_KEY,
  STALE_TIME_LARGE,
  STALE_TIME_MANUAL_ONLY,
  STALE_TIME_MEDIUM,
  STALE_TIME_SMALL,
} from '@/lib/constants';
import { CachedData, ProgressCallbacks } from '@/lib/types';
import { UserInfoFragment } from '@/lib/gql/types';
import { useSession } from 'next-auth/react';

const getStaleTime = (
  totalConnections: number,
  customStaleTime: number | null
) => {
  if (customStaleTime) {
    return customStaleTime * 60 * 1000;
  }

  if (totalConnections <= 2000) {
    return STALE_TIME_SMALL;
  }

  if (totalConnections <= 10000) {
    return STALE_TIME_MEDIUM;
  }

  if (totalConnections <= 50000) {
    return STALE_TIME_LARGE;
  }

  return STALE_TIME_MANUAL_ONLY;
};

export const useCacheManager = () => {
  const setNetwork = useNetworkStore((state) => state.setNetwork);
  const setGhosts = useGhostStore((state) => state.setGhosts);
  const addGhosts = useGhostStore((state) => state.addGhosts);
  const setGistName = useGistStore((state) => state.setGistName);
  const setDuplicateGistCount = useGistStore(
    (state) => state.setDuplicateGistCount
  );
  const setGistData = useGistStore((state) => state.setGistData);
  const setTimestamp = useGistStore((state) => state.setTimestamp);
  const settings = useSettingsStore();

  const { data } = useSession();
  const accessToken = data?.accessToken;
  const sessionOwnerLogin = data?.user?.login;

  const loadFromCache = useCallback(
    (cachedData: CachedData) => {
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
    },
    [setNetwork, setGhosts, setGistData, settings]
  );

  const initializeAndFetchNetwork = useCallback(
    async (
      client: GraphQLClient,
      username: string,
      token: string,
      progress: ProgressCallbacks
    ) => {
      const { show, update, complete, fail } = progress;
      const localGistName = window.localStorage.getItem(GIST_ID_STORAGE_KEY);
      setGistName(localGistName);

      const isForced = useGistStore.getState().forceNextRefresh;
      const currentGistName = useGistStore.getState().gistName;
      let activeGistName = currentGistName;
      let duplicateCacheCount = useGistStore.getState().duplicateGistCount;

      if (isForced) {
        useGistStore.getState().setForceNextRefresh(false);
      }

      if (!isForced) {
        const { canonicalGist, duplicateGists } = await findCanonicalCacheGist({
          token,
          ownerLogin: username,
          preferredGistId: currentGistName,
        });

        duplicateCacheCount = duplicateGists.length;
        setDuplicateGistCount(duplicateCacheCount);

        if (canonicalGist) {
          const cachedData = parseCache(canonicalGist);
          if (cachedData) {
            const normalizedCachedData = normalizeCachedData(
              cachedData,
              username
            );
            activeGistName = getGistIdentifier(canonicalGist);
            setGistName(activeGistName);

            if (duplicateGists.length > 0) {
              toast.info(
                `Found ${duplicateGists.length + 1} cache gists. Using the newest canonical cache.`
              );
            }

            if (
              shouldMigrateCanonicalCache(
                canonicalGist,
                normalizedCachedData,
                username
              )
            ) {
              const migratedGist = await writeCache(
                token,
                normalizedCachedData,
                canonicalGist.id
              );
              activeGistName = migratedGist.id;
              setGistName(activeGistName);
            }

            const totalConnections =
              normalizedCachedData.metadata.totalConnections;
            const staleTime = getStaleTime(
              totalConnections,
              settings.customStaleTime
            );
            const isStale =
              Date.now() - normalizedCachedData.timestamp > staleTime;
            loadFromCache(normalizedCachedData);

            if (!isStale) {
              toast.info('Loaded fresh data from cache.');
              return normalizedCachedData.network;
            }

            if (staleTime === STALE_TIME_MANUAL_ONLY) {
              toast.info(
                'Data loaded from cache. Refresh manually for the latest update.'
              );
              return normalizedCachedData.network;
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
                isApproximateTotal: p.hasFollowerTotalMismatch,
              },
              {
                label: 'Following',
                current: p.fetchedFollowing,
                total: p.totalFollowing,
                isApproximateTotal: p.hasFollowingTotalMismatch,
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
            cacheVersion: GIST_CACHE_VERSION,
            ownerLogin: username.toLowerCase(),
            cacheKey: buildCacheKey(username),
          },
        };

        const newGist = await writeCache(token, dataToCache, activeGistName, {
          discoverCanonicalFallback: isForced || !activeGistName,
        });

        setNetwork(network);
        setGhosts([]);
        setGistData({ timestamp, metadata: dataToCache.metadata });
        setGistName(newGist.id);
        setDuplicateGistCount(duplicateCacheCount);
        complete();

        return network;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Failed to sync network.';
        fail({ message });
        throw error;
      }
    },
    [
      settings,
      loadFromCache,
      setGhosts,
      setDuplicateGistCount,
      setGistName,
      setNetwork,
      setGistData,
    ]
  );

  const persistChanges = useCallback(async () => {
    if (!accessToken) return;

    const { network } = useNetworkStore.getState();
    const { ghosts } = useGhostStore.getState();
    const { metadata, gistName } = useGistStore.getState();
    const currentSettings = useSettingsStore.getState();

    if (!network || !metadata) return;

    const ownerLogin = sessionOwnerLogin ?? metadata.ownerLogin;
    if (!ownerLogin) {
      throw new Error('Cannot persist cache without a known owner login.');
    }

    const newTimestamp = Date.now();
    setTimestamp(newTimestamp);

    const normalizedMetadata = {
      ...metadata,
      cacheVersion: GIST_CACHE_VERSION,
      ownerLogin: ownerLogin.toLowerCase(),
      cacheKey: buildCacheKey(ownerLogin),
    };

    const dataToCache: CachedData = {
      network,
      ghosts,
      settings: currentSettings,
      timestamp: newTimestamp,
      metadata: normalizedMetadata,
    };

    const updatedGist = await writeCache(accessToken, dataToCache, gistName);
    setGistName(updatedGist.id);
    setGistData({ timestamp: newTimestamp, metadata: normalizedMetadata });
  }, [accessToken, sessionOwnerLogin, setTimestamp, setGistData, setGistName]);

  const cleanupDuplicateCaches = useCallback(async () => {
    if (!accessToken) {
      throw new Error(
        'Authentication is required to clean up duplicate caches.'
      );
    }

    const { metadata, gistName } = useGistStore.getState();
    const ownerLogin = sessionOwnerLogin ?? metadata?.ownerLogin;

    if (!ownerLogin) {
      throw new Error(
        'Could not determine which cache gists belong to this account.'
      );
    }

    const result = await cleanupDuplicateCacheGists({
      token: accessToken,
      ownerLogin,
      preferredGistId: gistName,
    });

    if (result.canonicalGist) {
      setGistName(result.canonicalGist.id);
    }

    setDuplicateGistCount(result.remainingDuplicateCount);

    if (result.deletedCount === 0 && result.remainingDuplicateCount === 0) {
      toast.info('No duplicate cache gists found.');
      return result;
    }

    if (result.remainingDuplicateCount > 0) {
      toast.error(
        `Deleted ${result.deletedCount} duplicate cache gist(s), but ${result.remainingDuplicateCount} still remain.`
      );
      return result;
    }

    toast.success(`Deleted ${result.deletedCount} duplicate cache gist(s).`);
    return result;
  }, [accessToken, sessionOwnerLogin, setDuplicateGistCount, setGistName]);

  const updateGhosts = useCallback(
    async (newGhosts: UserInfoFragment[]) => {
      addGhosts(newGhosts);
      await persistChanges();
    },
    [addGhosts, persistChanges]
  );

  return {
    initializeAndFetchNetwork,
    loadFromCache,
    persistChanges,
    cleanupDuplicateCaches,
    updateGhosts,
  };
};
