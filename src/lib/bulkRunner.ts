import { MAX_INLINE_RETRY_WAIT_MS, classifyError } from './rateLimit';

export type BulkStopReason = 'cancelled' | 'rate-limited';

export type BulkResult<T> = {
  /** Items GitHub accepted. */
  succeeded: T[];
  /** Items that failed for a reason other than throttling. */
  failed: T[];
  /** Items never attempted because the run stopped early. */
  skipped: T[];
  stopReason: BulkStopReason | null;
  /** For `rate-limited`: how long GitHub asked us to wait, when it said. */
  retryAfterMs: number | null;
};

export type BulkRunOptions<T> = {
  items: T[];
  run: (item: T) => Promise<unknown>;
  /** Called after each item settles, with the number processed so far. */
  onProgress?: (processed: number) => void;
  /** Called while waiting out a short rate limit. */
  onPause?: (waitMs: number) => void;
  isCancelled?: () => boolean;
  /** Pause between items to stay under GitHub's secondary rate limits. */
  delayMs?: number;
  /** How many times to wait out a short rate limit on the same item. */
  maxPausesPerItem?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs a bulk action sequentially. Ordinary failures are collected and the run
 * continues; a rate limit is not counted as a failure — the run pauses when
 * GitHub asks for a short wait, and stops (leaving the rest untouched) when
 * the wait is long. Cancellation is checked between items and during pauses.
 */
export const runBulk = async <T>({
  items,
  run,
  onProgress,
  onPause,
  isCancelled = () => false,
  delayMs = 250,
  maxPausesPerItem = 3,
  sleep = defaultSleep,
}: BulkRunOptions<T>): Promise<BulkResult<T>> => {
  const succeeded: T[] = [];
  const failed: T[] = [];
  let stopReason: BulkStopReason | null = null;
  let retryAfterMs: number | null = null;
  let index = 0;

  outer: for (; index < items.length; index++) {
    if (isCancelled()) {
      stopReason = 'cancelled';
      break;
    }

    const item = items[index];
    for (let pauses = 0; ; pauses++) {
      try {
        await run(item);
        succeeded.push(item);
        break;
      } catch (error) {
        const info = classifyError(error);
        if (!info.isRateLimited) {
          failed.push(item);
          break;
        }

        const wait = info.retryAfterMs ?? MAX_INLINE_RETRY_WAIT_MS;
        if (wait > MAX_INLINE_RETRY_WAIT_MS || pauses >= maxPausesPerItem) {
          stopReason = 'rate-limited';
          retryAfterMs = info.retryAfterMs;
          break outer;
        }

        onPause?.(wait);
        await sleep(wait);
        if (isCancelled()) {
          stopReason = 'cancelled';
          break outer;
        }
      }
    }

    onProgress?.(index + 1);

    if (index < items.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return {
    succeeded,
    failed,
    skipped: items.slice(succeeded.length + failed.length),
    stopReason,
    retryAfterMs,
  };
};
