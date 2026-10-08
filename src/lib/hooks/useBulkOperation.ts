import { useCallback, useRef, useState } from 'react';
import { useProgress } from '@/lib/context/progress';
import { NetworkUser } from '@/lib/types';
import { runBulk } from '@/lib/bulkRunner';

// The mutation function can be any async function that takes a user and returns a promise.
// This is compatible with the `mutateAsync` function from TanStack Query.
type AsyncMutationFn = (user: NetworkUser) => Promise<unknown>;

const formatWait = (ms: number | null) => {
  if (!ms) return 'later';
  const minutes = Math.ceil(ms / 60_000);
  return minutes <= 1 ? 'in about a minute' : `in about ${minutes} minutes`;
};

/**
 * Runs a bulk action over users one at a time with progress reporting. The run
 * can be cancelled from the progress toast; GitHub rate limits pause or stop
 * the run instead of being counted as per-user failures (see `runBulk`).
 */
export const useBulkOperation = (
  mutationFn: AsyncMutationFn,
  actionName: string,
  onBulkSuccess?: () => void | Promise<void>
) => {
  const { show, update, complete, fail } = useProgress();
  const [isPending, setIsPending] = useState(false);
  const cancelRef = useRef(false);

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const execute = async (users: NetworkUser[]) => {
    if (isPending) return;
    const total = users.length;
    if (total === 0) return;

    setIsPending(true);
    cancelRef.current = false;
    show({
      title: `Bulk ${actionName}`,
      message: `Processing ${total} users...`,
      items: [{ label: 'Users', current: 0, total }],
      onCancel: cancel,
    });

    let processed = 0;
    const result = await runBulk({
      items: users,
      run: mutationFn,
      isCancelled: () => cancelRef.current,
      onProgress: (count) => {
        processed = count;
        update(
          [{ label: 'Users', current: count, total }],
          `Processing ${total} users...`
        );
      },
      onPause: (waitMs) =>
        update(
          [{ label: 'Users', current: processed, total }],
          `GitHub is rate-limiting; resuming in ${Math.ceil(waitMs / 1000)}s...`
        ),
    });

    let postSuccessFailed = false;
    if (onBulkSuccess && result.succeeded.length > 0) {
      try {
        await onBulkSuccess();
      } catch (error) {
        console.error('Bulk operation post-success step failed:', error);
        postSuccessFailed = true;
      }
    }

    const done = `${result.succeeded.length} of ${total} done`;
    const failedLogins = result.failed.map((u) => u.login);

    if (result.stopReason === 'rate-limited') {
      fail({
        message: `Stopped: GitHub's rate limit was reached (${done}). Try the rest ${formatWait(result.retryAfterMs)}.`,
        details: failedLogins,
      });
    } else if (failedLogins.length > 0) {
      fail({
        message: `${done}; ${failedLogins.length} failed${result.stopReason === 'cancelled' ? ' before you cancelled' : ''}.`,
        details: failedLogins,
      });
    } else if (postSuccessFailed) {
      fail({
        message: 'Actions applied, but saving your changes failed.',
      });
    } else if (result.stopReason === 'cancelled') {
      complete({ message: `Cancelled. ${done}.` });
    } else {
      complete();
    }
    setIsPending(false);
  };

  return { execute, isPending, cancel };
};
