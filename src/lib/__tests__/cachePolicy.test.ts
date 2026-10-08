import { describe, expect, it } from 'vitest';

import { evaluateCachePolicy, getStaleTime } from '@/lib/cachePolicy';
import {
  GIST_CACHE_VERSION,
  READABLE_CACHE_VERSIONS,
  STALE_TIME_LARGE,
  STALE_TIME_MANUAL_ONLY,
  STALE_TIME_MEDIUM,
  STALE_TIME_SMALL,
} from '@/lib/constants';
import type { CachedData } from '@/lib/types';

const CURRENT_VERSION = GIST_CACHE_VERSION;

const metadata = (
  overrides: Partial<CachedData['metadata']> = {}
): CachedData['metadata'] => ({
  totalConnections: 100,
  fetchDuration: 0,
  cacheVersion: CURRENT_VERSION,
  ownerLogin: 'octocat',
  cacheKey: 'follow-sync:octocat:network-cache',
  ...overrides,
});

describe('getStaleTime', () => {
  it('honors a custom stale time (minutes -> ms) above all else', () => {
    expect(getStaleTime(9_999_999, 30)).toBe(30 * 60 * 1000);
  });

  it('honors an explicit 0-minute override instead of falling back to tiers', () => {
    expect(getStaleTime(100, 0)).toBe(0);
  });

  it.each([
    [0, STALE_TIME_SMALL],
    [2000, STALE_TIME_SMALL],
    [2001, STALE_TIME_MEDIUM],
    [10000, STALE_TIME_MEDIUM],
    [10001, STALE_TIME_LARGE],
    [50000, STALE_TIME_LARGE],
    [50001, STALE_TIME_MANUAL_ONLY],
  ])('maps %i connections to the right tier', (connections, expected) => {
    expect(getStaleTime(connections, null)).toBe(expected);
  });
});

describe('evaluateCachePolicy', () => {
  const base = {
    customStaleTime: null,
    readableCacheVersions: READABLE_CACHE_VERSIONS,
    now: 1_000_000,
  };

  it('serves a fresh, current-version cache', () => {
    const policy = evaluateCachePolicy({
      ...base,
      metadata: metadata({ totalConnections: 100 }),
      syncedAt: base.now - 1000, // 1s old, well within the 15m small window
    });
    expect(policy).toMatchObject({
      isOutdatedVersion: false,
      shouldHydrate: true,
      isStale: false,
      decision: 'serve-fresh',
    });
  });

  it('refetches a current-version cache once it goes stale', () => {
    const policy = evaluateCachePolicy({
      ...base,
      metadata: metadata({ totalConnections: 100 }),
      syncedAt: base.now - (STALE_TIME_SMALL + 1),
    });
    expect(policy.isStale).toBe(true);
    expect(policy.decision).toBe('refetch');
  });

  it('keeps serving a huge-network cache (infinite window never goes stale)', () => {
    // MANUAL_ONLY is Infinity, so `now - syncedAt > Infinity` is always false:
    // the cache is never stale and is served as-is, no auto-refetch. This is the
    // faithful behavior of the original inline logic (the "refresh manually"
    // branch it carried is unreachable with these constants).
    const policy = evaluateCachePolicy({
      ...base,
      metadata: metadata({ totalConnections: 60000 }),
      syncedAt: 0, // ancient, but the window is Infinity
    });
    expect(policy.staleTime).toBe(STALE_TIME_MANUAL_ONLY);
    expect(policy.isStale).toBe(false);
    expect(policy.decision).toBe('serve-fresh');
  });

  it('refetches and refuses to hydrate an outdated-version cache', () => {
    const policy = evaluateCachePolicy({
      ...base,
      metadata: metadata({ cacheVersion: '2.0', totalConnections: 100 }),
      syncedAt: base.now, // fresh by time, but schema is stale
    });
    expect(policy.isOutdatedVersion).toBe(true);
    expect(policy.shouldHydrate).toBe(false);
    expect(policy.decision).toBe('refetch');
  });

  it('still serves a 3.0 cache, so the 4.0 bump forces no resync', () => {
    const policy = evaluateCachePolicy({
      ...base,
      metadata: metadata({ cacheVersion: '3.0', totalConnections: 100 }),
      syncedAt: base.now - 1000,
    });
    expect(policy.isOutdatedVersion).toBe(false);
    expect(policy.decision).toBe('serve-fresh');
  });

  it('writes new caches under a version older code does not accept', () => {
    // Before the bump the app wrote and accepted only '3.0'; a cache written
    // now must read as outdated there (resync) rather than be misparsed.
    expect(GIST_CACHE_VERSION).not.toBe('3.0');
    expect(READABLE_CACHE_VERSIONS).toContain('3.0');
  });
});
