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
import {
  fetchAllUserFollowersAndFollowing,
  fetchRestFollowing,
  fetchRestFollowers,
} from '@/lib/gql/fetchers';
import { classifyFollowing, classifyFollowers, mergeGhosts } from '@/lib/utils';
import {
  GIST_CACHE_VERSION,
  GIST_ID_STORAGE_KEY,
  STALE_TIME_LARGE,
  STALE_TIME_MANUAL_ONLY,
  STALE_TIME_MEDIUM,
  STALE_TIME_SMALL,
} from '@/lib/constants';
import { CachedData, NetworkUser, ProgressCallbacks } from '@/lib/types';
import { useSession } from 'next-auth/react';

/**
 * Serializes gist writes across the whole app. Follow/unfollow, bulk actions,
 * ghost removal and settings saves can all fire `persistChanges` concurrently;
 * without serialization their read-modify-write cycles race and clobber each
 * other (and can spawn duplicate gists). Chaining every write guarantees each
 * one observes the previous write's resulting gist id.
 */
let writeChain: Promise<unknown> = Promise.resolve();

const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
  const run = writeChain.then(task, task);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

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
  const setRemovedGhostLogins = useGhostStore(
    (state) => state.setRemovedGhostLogins
  );
  const setGistName = useGistStore((state) => state.setGistName);
  const setDuplicateGistCount = useGistStore(
    (state) => state.setDuplicateGistCount
  );
  const setGistData = useGistStore((state) => state.setGistData);
  const settings = useSettingsStore();

  const { data, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const sessionOwnerLogin = data?.user?.login;

  const loadFromCache = useCallback(
    (cachedData: CachedData) => {
      setNetwork(cachedData.network);
      setGhosts(cachedData.ghosts);
      setRemovedGhostLogins(cachedData.removedGhosts ?? []);
      setGistData({
        timestamp: cachedData.timestamp,
        metadata: cachedData.metadata,
      });

      if (cachedData.settings) {
        settings.setShowAvatars(cachedData.settings.showAvatars);
        settings.setPaginationPageSize(cachedData.settings.paginationPageSize);
        settings.setCustomStaleTime(cachedData.settings.customStaleTime);
      }
    },
    [setNetwork, setGhosts, setRemovedGhostLogins, setGistData, settings]
  );

  const initializeAndFetchNetwork = useCallback(
    async (
      client: GraphQLClient,
      username: string,
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
          ownerLogin: username,
          preferredGistId: currentGistName,
        });

        duplicateCacheCount = duplicateGists.length;
        setDuplicateGistCount(duplicateCacheCount);

        if (canonicalGist) {
          const cachedData = parseCache(canonicalGist);
          if (cachedData) {
            // Caches written by an older schema version (e.g. before
            // organizations and the REST-diff ghost model existed) are forced
            // to re-fetch so the user gets the corrected data.
            const isOutdatedVersion =
              cachedData.metadata.cacheVersion !== GIST_CACHE_VERSION;

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
              !isOutdatedVersion &&
              shouldMigrateCanonicalCache(
                canonicalGist,
                normalizedCachedData,
                username
              )
            ) {
              const migratedGist = await writeCache(
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

            // Only serve the cache when it matches the current schema.
            if (!isOutdatedVersion) {
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

        // The REST lists are the counterpart to the GraphQL ones: the REST
        // following list surfaces organizations (GraphQL hides them) and the
        // REST lists exclude ghosts (which GraphQL still returns). Diffing each
        // side classifies users, orgs and ghosts.
        const [restFollowing, restFollowers] = await Promise.all([
          fetchRestFollowing(),
          fetchRestFollowers(),
        ]);

        const fetchEnd = performance.now();
        const fetchDuration = Math.round((fetchEnd - fetchStart) / 1000);

        const graphqlFollowers = (
          (networkData.followers.nodes ?? []) as NetworkUser[]
        ).filter((u): u is NetworkUser => Boolean(u?.login));

        const graphqlFollowing = (
          (networkData.following.nodes ?? []) as NetworkUser[]
        ).filter((u): u is NetworkUser => Boolean(u?.login));

        const { followers, ghosts: followerGhosts } = classifyFollowers({
          graphqlFollowers,
          restFollowers,
        });

        const { following, ghosts: followingGhosts } = classifyFollowing({
          graphqlFollowing,
          restFollowing,
        });

        const allGhosts = mergeGhosts(followingGhosts, followerGhosts);

        // Suppress just-removed ghosts that GitHub's eventually-consistent
        // GraphQL still returns. Self-clean the tombstone to only logins still
        // present in the GraphQL following list.
        const graphqlFollowingLogins = new Set(
          graphqlFollowing.map((u) => u.login.toLowerCase())
        );
        const prunedRemovedGhosts = [
          ...useGhostStore.getState().removedGhostLogins,
        ].filter((login) => graphqlFollowingLogins.has(login));
        const removedGhostSet = new Set(prunedRemovedGhosts);
        const ghosts = allGhosts.filter(
          (g) => !removedGhostSet.has(g.login.toLowerCase())
        );

        const network = { followers, following };
        const timestamp = Date.now();

        const dataToCache: CachedData = {
          network,
          ghosts,
          removedGhosts: prunedRemovedGhosts,
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

        const newGist = await writeCache(dataToCache, activeGistName, {
          discoverCanonicalFallback: isForced || !activeGistName,
        });

        setNetwork(network);
        setGhosts(ghosts);
        setRemovedGhostLogins(prunedRemovedGhosts);
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
      setRemovedGhostLogins,
      setDuplicateGistCount,
      setGistName,
      setNetwork,
      setGistData,
    ]
  );

  const persistChanges = useCallback(async () => {
    if (!isAuthenticated) return;

    await enqueueWrite(async () => {
      // Read state inside the serialized section so each write sees the latest
      // network/ghosts/gist id produced by any preceding write.
      const { network } = useNetworkStore.getState();
      const { ghosts, removedGhostLogins } = useGhostStore.getState();
      const { metadata, gistName } = useGistStore.getState();
      const currentSettings = useSettingsStore.getState();

      if (!network || !metadata) return;

      const ownerLogin = sessionOwnerLogin ?? metadata.ownerLogin;
      if (!ownerLogin) {
        throw new Error('Cannot persist cache without a known owner login.');
      }

      const newTimestamp = Date.now();

      const normalizedMetadata = {
        ...metadata,
        cacheVersion: GIST_CACHE_VERSION,
        ownerLogin: ownerLogin.toLowerCase(),
        cacheKey: buildCacheKey(ownerLogin),
      };

      const dataToCache: CachedData = {
        network,
        ghosts,
        removedGhosts: [...removedGhostLogins],
        settings: currentSettings,
        timestamp: newTimestamp,
        metadata: normalizedMetadata,
      };

      // Only commit the timestamp/metadata to the store after the write
      // succeeds, so a failed write doesn't show a misleading "last synced".
      const updatedGist = await writeCache(dataToCache, gistName);
      setGistName(updatedGist.id);
      setGistData({ timestamp: newTimestamp, metadata: normalizedMetadata });
    });
  }, [isAuthenticated, sessionOwnerLogin, setGistData, setGistName]);

  const cleanupDuplicateCaches = useCallback(async () => {
    if (!isAuthenticated) {
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
  }, [isAuthenticated, sessionOwnerLogin, setDuplicateGistCount, setGistName]);

  return {
    initializeAndFetchNetwork,
    loadFromCache,
    persistChanges,
    cleanupDuplicateCaches,
  };
};
