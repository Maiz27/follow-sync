// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/lib/context/progress', () => ({
  useProgress: () => ({
    show: vi.fn(),
    update: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  }),
}));

import { useBulkOperation } from '@/lib/hooks/useBulkOperation';
import { GitHubRestError } from '@/lib/ghRest';
import type { NetworkUser } from '@/lib/types';

const user = (login: string) => ({ login }) as NetworkUser;

describe('useBulkOperation', () => {
  it('hands only the rows that succeeded to onBulkSuccess', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onBulkSuccess = vi.fn();
    const run = vi.fn(async (u: NetworkUser) => {
      if (u.login === 'bad') throw new Error('nope');
    });
    const { result } = renderHook(() =>
      useBulkOperation(run, 'Unfollowing', onBulkSuccess)
    );

    await act(async () => {
      await result.current.execute([user('good'), user('bad')]);
    });

    expect(onBulkSuccess).toHaveBeenCalledWith([user('good')]);
  });

  describe('cancelling', () => {
    afterEach(() => vi.useRealTimers());

    it('ends a rate-limit pause right away instead of after the wait', async () => {
      vi.useFakeTimers();
      const run = vi.fn(async () => {
        throw new GitHubRestError(
          429,
          {},
          new Headers({ 'retry-after': '30' })
        );
      });
      const { result } = renderHook(() => useBulkOperation(run, 'Following'));

      let finished = false;
      let execution: Promise<void> = Promise.resolve();
      await act(async () => {
        execution = result.current.execute([user('a'), user('b')]).then(() => {
          finished = true;
        });
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(run).toHaveBeenCalledTimes(1);

      await act(async () => {
        result.current.cancel();
        // Far less than the 30s GitHub asked for.
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(finished).toBe(true);
      await execution;
      expect(run).toHaveBeenCalledTimes(1);
    });
  });
});
