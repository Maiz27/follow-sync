import { describe, expect, it, vi } from 'vitest';

import { runBulk } from '@/lib/bulkRunner';
import { GitHubRestError } from '@/lib/ghRest';

const noSleep = () => Promise.resolve();
const rateLimited = (retryAfter: string) =>
  new GitHubRestError(429, {}, new Headers({ 'retry-after': retryAfter }));

describe('runBulk', () => {
  it('counts ordinary failures and keeps going', async () => {
    const run = vi.fn(async (n: number) => {
      if (n % 2) throw new Error('boom');
    });
    const onProgress = vi.fn();

    const result = await runBulk({
      items: [0, 1, 2, 3],
      run,
      onProgress,
      sleep: noSleep,
    });

    expect(result.succeeded).toEqual([0, 2]);
    expect(result.failed).toEqual([1, 3]);
    expect(result.skipped).toEqual([]);
    expect(result.stopReason).toBeNull();
    expect(onProgress).toHaveBeenLastCalledWith(4);
  });

  it('pauses on a short rate limit and retries the same item', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(rateLimited('2'))
      .mockResolvedValue(undefined);
    const sleep = vi.fn(noSleep);
    const onPause = vi.fn();

    const result = await runBulk({
      items: ['a', 'b'],
      run,
      sleep,
      onPause,
    });

    expect(result.succeeded).toEqual(['a', 'b']);
    expect(result.failed).toEqual([]);
    expect(onPause).toHaveBeenCalledWith(2_000);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('stops on a long rate limit without counting it as a failure', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(rateLimited('3600'));

    const result = await runBulk({
      items: ['a', 'b', 'c'],
      run,
      sleep: noSleep,
    });

    expect(result.stopReason).toBe('rate-limited');
    expect(result.retryAfterMs).toBe(3_600_000);
    expect(result.succeeded).toEqual(['a']);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual(['b', 'c']);
  });

  it('stops when cancelled', async () => {
    let cancelled = false;
    const run = vi.fn(async () => {
      cancelled = true;
    });

    const result = await runBulk({
      items: [1, 2, 3],
      run,
      isCancelled: () => cancelled,
      sleep: noSleep,
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.stopReason).toBe('cancelled');
    expect(result.skipped).toEqual([2, 3]);
  });

  it('stops a rate-limit pause as soon as the run is aborted', async () => {
    const controller = new AbortController();
    const run = vi.fn().mockRejectedValue(rateLimited('30'));
    // A pause that would never end on its own.
    const sleep = vi.fn(() => new Promise<void>(() => undefined));

    const pending = runBulk({
      items: ['a', 'b'],
      run,
      sleep,
      signal: controller.signal,
      onPause: () => controller.abort(),
    });

    const result = await pending;
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.stopReason).toBe('cancelled');
    expect(result.skipped).toEqual(['a', 'b']);
  });

  it('does not wait out the delay between items once aborted', async () => {
    const controller = new AbortController();
    const run = vi.fn(async () => controller.abort());
    const sleep = vi.fn(() => new Promise<void>(() => undefined));

    const result = await runBulk({
      items: [1, 2],
      run,
      sleep,
      signal: controller.signal,
    });

    expect(result.stopReason).toBe('cancelled');
    expect(result.succeeded).toEqual([1]);
    expect(result.skipped).toEqual([2]);
  });
});
