import { GraphQLClient } from 'graphql-request';
import { toast } from 'sonner';
import { useCallback } from 'react';

import { useNetworkStore } from '@/lib/store/network';
import { useGistStore } from '@/lib/store/gist';
import { useGhostStore } from '@/lib/store/ghost';
import { pickPersistedSettings, useSettingsStore } from '@/lib/store/settings';
import { useIgnoreStore } from '@/lib/store/ignore';
import { diffNetworks, hasChanges } from '@/lib/networkDiff';

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
import { fetchAndClassifyNetwork } from '@/lib/networkSync';
import { evaluateCachePolicy } from '@/lib/cachePolicy';
import { enqueuePersist } from '@/lib/persistenceQueue';
import {
  GIST_CACHE_VERSION,
  LEGACY_GIST_ID_STORAGE_KEY,
  gistIdStorageKey,
} from '@/lib/constants';
import { readStorage, writeStorage } from '@/lib/storage';
import {
  CachedData,
  ProgressCallbackItem,
  ProgressCallbacks,
} from '@/lib/types';
import { useSession } from 'next-auth/react';

/**
 * Builds the cache payload from the *current* store state. Always called inside
 * an `enqueuePersist` task so each write sees the result of every change and
 * write queued before it.
 */
const snapshotStores = ({
  ownerLogin,
  timestamp,
  metadata,
}: {
  ownerLogin: string;
  timestamp: number;
  metadata: CachedData['metadata'];
}): CachedData => {
  const { network } = useNetworkStore.getState();
  const { ghosts, removedGhostLogins } = useGhostStore.getState();

  return {
    network,
    ghosts,
    removedGhosts: [...removedGhostLogins],
    settings: pickPersistedSettings(useSettingsStore.getState()),
    ignoredLogins: [...useIgnoreStore.getState().ignoredLogins],
    lastDiff: useGistStore.getState().lastDiff,
    timestamp,
    // Carried over from the last full sync; writing doesn't refresh it.
    syncedAt: useGistStore.getState().syncedAt ?? timestamp,
    metadata: {
      ...metadata,
      cacheVersion: GIST_CACHE_VERSION,
      ownerLogin: ownerLogin.toLowerCase(),
      cacheKey: buildCacheKey(ownerLogin),
    },
  };
};

/**
 * The sync currently running, app-wide. A newer sync (forced refresh, another
 * account) aborts it, so two syncs never paginate GitHub concurrently or race
 * to write the stores.
 */
let activeSync: AbortController | null = null;

const SYNC_MESSAGE = 'Fetching connections from GitHub...';

export const useCacheManager = () => {
  const setNetwork = useNetworkStore((state) => state.setNetwork);
  const reconcileNetwork = useNetworkStore((state) => state.reconcileNetwork);
  const setGhosts = useGhostStore((state) => state.setGhosts);
  const setRemovedGhostLogins = useGhostStore(
    (state) => state.setRemovedGhostLogins
  );
  const setGistName = useGistStore((state) => state.setGistName);
  const setOwnerLogin = useGistStore((state) => state.setOwnerLogin);
  const setDuplicateGistCount = useGistStore(
    (state) => state.setDuplicateGistCount
  );
  const setGistData = useGistStore((state) => state.setGistData);

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
        syncedAt: cachedData.syncedAt ?? cachedData.timestamp,
        metadata: cachedData.metadata,
      });
      useIgnoreStore
        .getState()
        .setIgnoredLogins(cachedData.ignoredLogins ?? []);
      useGistStore.getState().setLastDiff(cachedData.lastDiff ?? null);

      if (cachedData.settings) {
        const settings = useSettingsStore.getState();
        settings.setShowAvatars(cachedData.settings.showAvatars);
        settings.setPaginationPageSize(cachedData.settings.paginationPageSize);
        settings.setCustomStaleTime(cachedData.settings.customStaleTime);
      }
    },
    [setNetwork, setGhosts, setRemovedGhostLogins, setGistData]
  );

  const initializeAndFetchNetwork = useCallback(
    async (
      client: GraphQLClient,
      username: string,
      progress: ProgressCallbacks
    ) => {
      const { show, update, complete, fail } = progress;

      activeSync?.abort(
        new DOMException('Superseded by a newer sync.', 'AbortError')
      );
      const controller = new AbortController();
      activeSync = controller;
      const { signal } = controller;

      // The remembered gist id is scoped to this account; the old global key
      // could belong to whoever used this browser before, so drop it.
      setOwnerLogin(username);
      writeStorage(LEGACY_GIST_ID_STORAGE_KEY, null);
      const localGistName = readStorage(gistIdStorageKey(username));
      if (!useGistStore.getState().gistName) {
        setGistName(localGistName);
      }

      // The login cache writes are labelled with. Starts as the session login
      // and is replaced by what GitHub reports (gist owner, GraphQL viewer),
      // which differs after a GitHub rename until the session refreshes.
      let identityLogin = (
        useGistStore.getState().viewerLogin ?? username
      ).toLowerCase();

      const isForced = useGistStore.getState().forceNextRefresh;
      const currentGistName = useGistStore.getState().gistName;
      let activeGistName = currentGistName;
      let duplicateCacheCount = useGistStore.getState().duplicateGistCount;

      if (isForced) {
        useGistStore.getState().setForceNextRefresh(false);
      }

      /**
       * Finds, validates and (when fresh enough) serves the cache gist.
       * Returns the network when the cache was served as-is, or null when a
       * sync should run.
       */
      const loadCachedNetwork = async () => {
        const {
          canonicalGist,
          duplicateGists,
          scannedAll,
          resolvedOwnerLogin,
        } = await findCanonicalCacheGist({
          ownerLogin: username,
          viewerLogin: useGistStore.getState().viewerLogin,
          preferredGistId: currentGistName,
        });
        signal.throwIfAborted();
        identityLogin = resolvedOwnerLogin;
        useGistStore.getState().setViewerLogin(identityLogin);

        // Without a full scan the duplicate count is unknown; keep the last one.
        if (scannedAll) {
          duplicateCacheCount = duplicateGists.length;
          setDuplicateGistCount(duplicateCacheCount);
        }

        if (canonicalGist) {
          const cachedData = parseCache(canonicalGist);
          if (cachedData) {
            // Evaluate against the RAW cached version before normalization
            // overwrites it. Caches from an older schema version (e.g. before
            // organizations and the REST-diff ghost model existed) are refetched
            // so the user gets the corrected data.
            const policy = evaluateCachePolicy({
              metadata: cachedData.metadata,
              // Staleness is about the last full sync, not the last write.
              syncedAt: cachedData.syncedAt ?? cachedData.timestamp,
              // The settings store isn't hydrated yet on first load (it only
              // lives in the cache), so the cached override wins.
              customStaleTime:
                cachedData.settings?.customStaleTime ??
                useSettingsStore.getState().customStaleTime,
              currentCacheVersion: GIST_CACHE_VERSION,
              now: Date.now(),
            });

            // A cache recorded under an older login of this account (GitHub
            // rename) is relabelled here and rewritten by the migration below.
            const normalizedCachedData = normalizeCachedData(
              cachedData,
              identityLogin
            );
            activeGistName = getGistIdentifier(canonicalGist);
            setGistName(activeGistName);

            if (duplicateGists.length > 0) {
              toast.info(
                `Found ${duplicateGists.length + 1} cache gists. Using the newest canonical cache.`
              );
            }

            if (
              !policy.isOutdatedVersion &&
              shouldMigrateCanonicalCache(
                canonicalGist,
                normalizedCachedData,
                identityLogin
              )
            ) {
              try {
                const migratedGist = await enqueuePersist(() =>
                  writeCache(normalizedCachedData, canonicalGist.id)
                );
                activeGistName = migratedGist.id;
                setGistName(activeGistName);
              } catch (error) {
                // The cache is still usable as read; the migration is retried
                // on the next write.
                console.warn('Failed to migrate the cache gist.', error);
              }
            }

            // Only serve the cache when it matches the current schema.
            if (policy.shouldHydrate) {
              loadFromCache(normalizedCachedData);

              if (policy.decision === 'serve-fresh') {
                toast.info('Loaded fresh data from cache.');
                return normalizedCachedData.network;
              }

              if (policy.decision === 'serve-manual') {
                toast.info(
                  'Data loaded from cache. Refresh manually for the latest update.'
                );
                return normalizedCachedData.network;
              }
            }
          }
        }
        return null;
      };

      if (!isForced) {
        try {
          const served = await loadCachedNetwork();
          if (served) return served;
        } catch (error) {
          if (signal.aborted) throw error;
          // Discovery/migration problems must never block the dashboard: warn
          // and fall through to a normal sync, which writes a fresh cache.
          console.error('Failed to load the network cache gist:', error);
          toast.warning(
            "Couldn't load your cached network; syncing from GitHub instead."
          );
        }
      }

      const fetchStart = performance.now();
      const syncStartedAt = Date.now();
      let progressItems: ProgressCallbackItem[] = [
        { label: 'Followers', current: 0, total: 0 },
        { label: 'Following', current: 0, total: 0 },
      ];
      show({
        title: 'Syncing Your Network',
        message: SYNC_MESSAGE,
        items: progressItems,
      });

      try {
        const {
          viewerLogin,
          followers,
          following,
          ghosts: allGhosts,
          graphqlFollowingLogins,
        } = await fetchAndClassifyNetwork({
          client,
          signal,
          onProgress: (p) => {
            progressItems = [
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
            ];
            update(progressItems, SYNC_MESSAGE);
          },
          onRateLimitPause: (waitMs) => {
            update(
              progressItems,
              `Rate limited by GitHub, resuming in ${Math.ceil(waitMs / 1000)}s...`
            );
          },
        });
        // Superseded while the last page landed: leave the stores to the
        // newer sync.
        signal.throwIfAborted();

        if (viewerLogin) {
          identityLogin = viewerLogin.toLowerCase();
          useGistStore.getState().setViewerLogin(identityLogin);
        }

        const fetchEnd = performance.now();
        const fetchDuration = Math.round((fetchEnd - fetchStart) / 1000);

        // Suppress just-removed ghosts that GitHub's eventually-consistent
        // GraphQL still returns. Self-clean the tombstone to only logins still
        // present in the GraphQL following list. Read at landing time, so ghosts
        // removed while the sync ran stay removed.
        const prunedRemovedGhosts = [
          ...useGhostStore.getState().removedGhostLogins,
        ].filter((login) => graphqlFollowingLogins.has(login));
        const removedGhostSet = new Set(prunedRemovedGhosts);
        const ghosts = allGhosts.filter(
          (g) => !removedGhostSet.has(g.login.toLowerCase())
        );

        // "Changes since last sync": compare against the snapshot this session
        // already holds (the cache, plus any changes made in-app since), so
        // only changes made elsewhere — new/lost followers etc. — show up.
        const previousTimestamp = useGistStore.getState().syncedAt;
        if (previousTimestamp !== null) {
          const diff = diffNetworks(
            useNetworkStore.getState().network,
            { followers, following },
            { since: previousTimestamp, at: Date.now() }
          );
          if (hasChanges(diff)) {
            useGistStore.getState().setLastDiff(diff);
          }
        }

        // Hydrate the store with the freshly fetched network first, so a gist
        // write failure can't throw away an expensive successful sync. Follows
        // and unfollows made while the sync ran are re-applied on top.
        reconcileNetwork({ followers, following }, syncStartedAt);
        setGhosts(ghosts);
        setRemovedGhostLogins(prunedRemovedGhosts);

        const timestamp = Date.now();
        const reconciled = useNetworkStore.getState().network;
        const metadata: CachedData['metadata'] = {
          totalConnections:
            reconciled.followers.length + reconciled.following.length,
          fetchDuration,
          cacheVersion: GIST_CACHE_VERSION,
          ownerLogin: identityLogin,
          cacheKey: buildCacheKey(identityLogin),
        };
        setGistData({ timestamp, syncedAt: timestamp, metadata });
        setDuplicateGistCount(duplicateCacheCount);

        try {
          // Serialized with every other cache write, and built from the store
          // at write time so it includes changes queued ahead of it.
          await enqueuePersist(async () => {
            const gistId = useGistStore.getState().gistName ?? activeGistName;
            const newGist = await writeCache(
              snapshotStores({
                ownerLogin: identityLogin,
                timestamp,
                metadata,
              }),
              gistId,
              { discoverCanonicalFallback: isForced || !gistId }
            );
            setGistName(newGist.id);
          });
        } catch (error) {
          // The sync itself succeeded; only persisting it to the gist cache
          // failed. Keep the data and surface a non-fatal warning rather than
          // erroring the whole sync.
          console.error('Failed to persist network cache to gist:', error);
          toast.error(
            'Synced your network, but saving the cache to a gist failed.'
          );
        }

        complete();

        return useNetworkStore.getState().network;
      } catch (error: unknown) {
        // A superseded sync stays quiet: the progress toast now belongs to the
        // sync that replaced it.
        if (!signal.aborted) {
          const message =
            error instanceof Error ? error.message : 'Failed to sync network.';
          fail({ message });
        }
        throw error;
      } finally {
        if (activeSync === controller) activeSync = null;
      }
    },
    [
      loadFromCache,
      reconcileNetwork,
      setGhosts,
      setRemovedGhostLogins,
      setDuplicateGistCount,
      setGistName,
      setOwnerLogin,
      setGistData,
    ]
  );

  const persistChanges = useCallback(async () => {
    if (!isAuthenticated) return;

    await enqueuePersist(async () => {
      // Read state inside the serialized section so each write sees the latest
      // network/ghosts/gist id produced by any preceding write.
      const { metadata, gistName, viewerLogin } = useGistStore.getState();
      const { network } = useNetworkStore.getState();

      if (!network || !metadata) return;

      const ownerLogin =
        viewerLogin ?? sessionOwnerLogin ?? metadata.ownerLogin;
      if (!ownerLogin) {
        throw new Error('Cannot persist cache without a known owner login.');
      }

      const newTimestamp = Date.now();
      const dataToCache = snapshotStores({
        ownerLogin,
        timestamp: newTimestamp,
        metadata,
      });

      // Only commit the timestamp/metadata to the store after the write
      // succeeds, so a failed write doesn't show a misleading "last synced".
      const updatedGist = await writeCache(dataToCache, gistName);
      setGistName(updatedGist.id);
      setGistData({ timestamp: newTimestamp, metadata: dataToCache.metadata });
    });
  }, [isAuthenticated, sessionOwnerLogin, setGistData, setGistName]);

  const cleanupDuplicateCaches = useCallback(async () => {
    if (!isAuthenticated) {
      throw new Error(
        'Authentication is required to clean up duplicate caches.'
      );
    }

    const { metadata, gistName, viewerLogin } = useGistStore.getState();
    const ownerLogin = sessionOwnerLogin ?? viewerLogin ?? metadata?.ownerLogin;

    if (!ownerLogin) {
      throw new Error(
        'Could not determine which cache gists belong to this account.'
      );
    }

    const result = await cleanupDuplicateCacheGists({
      ownerLogin,
      viewerLogin,
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
