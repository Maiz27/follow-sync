import {
  STALE_TIME_LARGE,
  STALE_TIME_MANUAL_ONLY,
  STALE_TIME_MEDIUM,
  STALE_TIME_SMALL,
} from '@/lib/constants';
import type { CachedData } from '@/lib/types';

/**
 * Adaptive stale window: the larger a network, the more expensive a refetch, so
 * bigger networks tolerate older caches. A user-set `customStaleTime` (minutes)
 * always wins.
 */
export const getStaleTime = (
  totalConnections: number,
  customStaleTime: number | null
): number => {
  // `null` means "no override"; an explicit 0 is a valid choice (always stale)
  // and must not be treated as absent.
  if (customStaleTime !== null) {
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

export type CachePolicyDecision = 'serve-fresh' | 'serve-manual' | 'refetch';

export type CachePolicy = {
  /** Cache was written by an older schema version and can't be trusted. */
  isOutdatedVersion: boolean;
  staleTime: number;
  isStale: boolean;
  /** Whether the cached payload is safe to hydrate into the store. */
  shouldHydrate: boolean;
  decision: CachePolicyDecision;
};

/**
 * Pure decision function for what to do with a discovered cache: serve it as-is,
 * serve it but leave refreshing to the user, or refetch. Kept free of toasts,
 * stores, and clocks (the caller passes `now`) so it can be table-tested.
 *
 * Note: `metadata.cacheVersion` must be the *raw* cached version — callers that
 * have already run `normalizeCachedData` will have overwritten it.
 */
export const evaluateCachePolicy = ({
  metadata,
  timestamp,
  customStaleTime,
  currentCacheVersion,
  now,
}: {
  metadata: CachedData['metadata'];
  timestamp: number;
  customStaleTime: number | null;
  currentCacheVersion: string;
  now: number;
}): CachePolicy => {
  const isOutdatedVersion = metadata.cacheVersion !== currentCacheVersion;
  const staleTime = getStaleTime(metadata.totalConnections, customStaleTime);
  const isStale = now - timestamp > staleTime;
  const shouldHydrate = !isOutdatedVersion;

  let decision: CachePolicyDecision = 'refetch';
  if (!isOutdatedVersion) {
    if (!isStale) {
      decision = 'serve-fresh';
    } else if (staleTime === STALE_TIME_MANUAL_ONLY) {
      decision = 'serve-manual';
    }
  }

  return { isOutdatedVersion, staleTime, isStale, shouldHydrate, decision };
};
