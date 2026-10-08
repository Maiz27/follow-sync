import { GraphQLClient } from 'graphql-request';
import { toast } from 'sonner';
import { useCallback } from 'react';

import { useNetworkStore } from '@/lib/store/network';
import { useGistStore } from '@/lib/store/gist';
import { useGhostStore } from '@/lib/store/ghost';
import { pickPersistedSettings, useSettingsStore } from '@/lib/store/settings';
import { useIgnoreStore } from '@/lib/store/ignore';
import { switchAccount } from '@/lib/store/account';
import { diffNetworks, hasChanges } from '@/lib/networkDiff';
import { toUserMessage } from '@/lib/errors';

import {
  buildCacheKey,
  cleanupDuplicateCacheGists,
  findCanonicalCacheGist,
  getGistIdentifier,
  normalizeCachedData,
  parseCache,
  rememberCacheBase,
  shouldMigrateCanonicalCache,
  writeCache,
} from '@/lib/gist';
import { fetchAndClassifyNetwork } from '@/lib/networkSync';
import { evaluateCachePolicy } from '@/lib/cachePolicy';
import { enqueuePersist } from '@/lib/persistenceQueue';
import {
  GIST_CACHE_VERSION,
  LEGACY_GIST_ID_STORAGE_KEY,
  READABLE_CACHE_VERSIONS,
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
  const reconcileNetwork = useNetworkStore((state) => state.reconcileNetwork);
  const setGhosts = useGhostStore((state) => state.setGhosts);
  const setRemovedGhostLogins = useGhostStore(
    (state) => state.setRemovedGhostLogins
  );
  const setGistName = useGistStore((state) => state.setGistName);
  const setDuplicateGistCount = useGistStore(
    (state) => state.setDuplicateGistCount
  );
  const setGistData = useGistStore((state) => state.setGistData);

  const { data, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const sessionOwnerLogin = data?.user?.login;

  const loadFromCache = useCallback(
    (cachedData: CachedData) => {
      // The stores only ever hold this account's state (switchAccount resets
      // them when the account changes), so this may be a reload of the same
      // account's cache, e.g. after a remount once React Query dropped the
      // query. Follows/unfollows in flight or not yet written to the gist are
      // re-applied on top of it rather than overwritten, as after a sync.
      reconcileNetwork(
        cachedData.network,
        cachedData.syncedAt ?? cachedData.timestamp
      );
      // Same for ghost removals: keep those made here since.
      const removedGhosts = new Set([
        ...(cachedData.removedGhosts ?? []).map((login) => login.toLowerCase()),
        ...useGhostStore.getState().removedGhostLogins,
      ]);
      setGhosts(
        cachedData.ghosts.filter(
          (ghost) => !removedGhosts.has(ghost.login.toLowerCase())
        )
      );
      setRemovedGhostLogins([...removedGhosts]);
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
    [reconcileNetwork, setGhosts, setRemovedGhostLogins, setGistData]
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

      // The stores now belong to this account. Signing in as someone else
      // (in another tab) resets everything the previous account left here,
      // so none of it reaches this account's cache.
      switchAccount(username);

      // The remembered gist id is scoped to this account. The old global key
      // is carried over once (unless this account already has its own) and
      // then dropped: it could belong to whoever used this browser before,
      // but it is only a hint — discovery still checks that GitHub reports
      // this account as the gist's owner before using it.
      const legacyGistName = readStorage(LEGACY_GIST_ID_STORAGE_KEY);
      if (legacyGistName && !readStorage(gistIdStorageKey(username))) {
        writeStorage(gistIdStorageKey(username), legacyGistName);
      }
      writeStorage(LEGACY_GIST_ID_STORAGE_KEY, null);
      const localGistName = readStorage(gistIdStorageKey(username));
      if (!useGistStore.getState().gistName) {
        setGistName(localGistName, username);
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
              readableCacheVersions: READABLE_CACHE_VERSIONS,
              now: Date.now(),
            });

            // A cache recorded under an older login of this account (GitHub
            // rename) is relabelled here and rewritten by the migration below.
            const normalizedCachedData = normalizeCachedData(
              cachedData,
              identityLogin
            );
            activeGistName = getGistIdentifier(canonicalGist);
            setGistName(activeGistName, username);

            // The stores are about to be based on this revision of the gist:
            // a later write that finds it changed since merges instead of
            // overwriting. Recorded before the migration write below, which
            // moves the base on to the revision it creates.
            if (policy.shouldHydrate) {
              rememberCacheBase(canonicalGist, cachedData);
            }

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
                const migratedGist = await enqueuePersist(() => {
                  // Superseded while queued: leave the gist to the newer sync.
                  signal.throwIfAborted();
                  return writeCache(normalizedCachedData, canonicalGist.id);
                });
                signal.throwIfAborted();
                activeGistName = migratedGist.id;
                setGistName(activeGistName, username);
              } catch (error) {
                if (signal.aborted) throw error;
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

        // The snapshot this session holds (the cache, plus any changes made
        // in-app since), read before the fetched lists replace it.
        const previousSyncedAt = useGistStore.getState().syncedAt;
        const previousOwnerLogin =
          useGistStore.getState().metadata?.ownerLogin?.toLowerCase() ?? null;
        const previousNetwork = useNetworkStore.getState().network;

        // Hydrate the store with the freshly fetched network first, so a gist
        // write failure can't throw away an expensive successful sync. Follows
        // and unfollows made while the sync ran are re-applied on top.
        reconcileNetwork({ followers, following }, syncStartedAt);
        setGhosts(ghosts);
        setRemovedGhostLogins(prunedRemovedGhosts);

        // "Changes since last sync": diff the previous snapshot against the
        // fetched lists *with* in-app changes re-applied, so only changes made
        // elsewhere show up — not a follow made here while GitHub was being
        // read. A sync that finds nothing replaces the previous diff. Only a
        // snapshot of this same account is compared; any other diff held
        // here isn't this account's.
        if (previousOwnerLogin !== identityLogin) {
          useGistStore.getState().setLastDiff(null);
        } else if (previousSyncedAt !== null) {
          const diff = diffNetworks(
            previousNetwork,
            useNetworkStore.getState().network,
            { since: previousSyncedAt, at: Date.now() }
          );
          useGistStore.getState().setLastDiff(hasChanges(diff) ? diff : null);
        }

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
            // Superseded while queued: the stores now belong to the newer
            // sync (possibly another account), so this snapshot isn't ours.
            signal.throwIfAborted();
            const gistId = useGistStore.getState().gistName ?? activeGistName;
            const newGist = await writeCache(
              snapshotStores({
                ownerLogin: identityLogin,
                timestamp,
                metadata,
              }),
              gistId,
              {
                discoverCanonicalFallback: isForced || !gistId,
                // The gist changed elsewhere since it was read: show the
                // merged result.
                onMerged: (merged) => {
                  if (!signal.aborted) loadFromCache(merged);
                },
                onWarning: (message) => toast.warning(message),
              }
            );
            setGistName(newGist.id, username);
          });
        } catch (error) {
          if (signal.aborted) throw error;
          // The sync itself succeeded; only persisting it to the gist cache
          // failed. Keep the data and surface a non-fatal warning rather than
          // erroring the whole sync.
          console.error('Failed to persist network cache to gist:', error);
          toast.error(
            toUserMessage(
              error,
              'Synced your network, but saving the cache to a gist failed.'
            )
          );
        }
        // Superseded during the write: the progress toast and the result
        // belong to the newer sync.
        signal.throwIfAborted();

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
      setGistData,
    ]
  );

  const persistChanges = useCallback(async () => {
    if (!isAuthenticated) return;

    await enqueuePersist(async () => {
      // Read state inside the serialized section so each write sees the latest
      // network/ghosts/gist id produced by any preceding write.
      const {
        metadata,
        gistName,
        viewerLogin,
        ownerLogin: accountLogin,
      } = useGistStore.getState();
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
      // Without a known gist id (e.g. the sync's own write failed), look for
      // the account's existing cache before creating a new gist.
      let written = dataToCache;
      const updatedGist = await writeCache(dataToCache, gistName, {
        discoverCanonicalFallback: !gistName,
        // Another device or tab wrote the gist since: show what was merged.
        onMerged: (merged) => {
          written = merged;
          if (useGistStore.getState().ownerLogin === accountLogin) {
            loadFromCache(merged);
          }
        },
        onWarning: (message) => toast.warning(message),
      });
      setGistName(updatedGist.id, accountLogin);
      // The account changed during the write: its stores were reset and
      // aren't described by this write.
      if (useGistStore.getState().ownerLogin !== accountLogin) return;
      setGistData({ timestamp: newTimestamp, metadata: written.metadata });
    });
  }, [
    isAuthenticated,
    sessionOwnerLogin,
    loadFromCache,
    setGistData,
    setGistName,
  ]);

  const cleanupDuplicateCaches = useCallback(async () => {
    if (!isAuthenticated) {
      throw new Error(
        'Authentication is required to clean up duplicate caches.'
      );
    }

    // Serialized with cache writes: a write queued meanwhile runs after the
    // deletions and reads the surviving gist id then, so it never targets a
    // gist that was just deleted (nor does a running write race the scan).
    const result = await enqueuePersist(async () => {
      const {
        metadata,
        gistName,
        viewerLogin,
        ownerLogin: accountLogin,
      } = useGistStore.getState();
      const ownerLogin =
        sessionOwnerLogin ?? viewerLogin ?? metadata?.ownerLogin;

      if (!ownerLogin) {
        throw new Error(
          'Could not determine which cache gists belong to this account.'
        );
      }

      const cleanup = await cleanupDuplicateCacheGists({
        ownerLogin,
        viewerLogin,
        preferredGistId: gistName,
      });

      if (cleanup.canonicalGist) {
        setGistName(cleanup.canonicalGist.id, accountLogin);
      }
      if (useGistStore.getState().ownerLogin === accountLogin) {
        setDuplicateGistCount(cleanup.remainingDuplicateCount);
      }
      return cleanup;
    });

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
