import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RateLimitError,
  classifyError,
  getRetryAfterMs,
  withRetry,
  createRetryBudget,
} from '@/lib/rateLimit';
import { GitHubRestError } from '@/lib/ghRest';

const headers = (values: Record<string, string>) => new Headers(values);

describe('getRetryAfterMs', () => {
  it('reads Retry-After seconds', () => {
    expect(getRetryAfterMs(headers({ 'retry-after': '30' }))).toBe(30_000);
  });

  it('reads the reset time when the quota is exhausted', () => {
    expect(
      getRetryAfterMs(
        headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '100' }),
        40_000
      )
    ).toBe(60_000);
  });

  it('ignores the reset time while quota remains', () => {
    expect(
      getRetryAfterMs(
        headers({ 'x-ratelimit-remaining': '10', 'x-ratelimit-reset': '100' })
      )
    ).toBeNull();
  });
});

describe('classifyError', () => {
  it('classifies REST rate limits with their wait', () => {
    const error = new GitHubRestError(
      403,
      { message: 'API rate limit exceeded' },
      headers({ 'retry-after': '5' })
    );
    expect(classifyError(error)).toMatchObject({
      isRateLimited: true,
      isRetryable: true,
      retryAfterMs: 5_000,
    });
  });

  it('does not treat a plain 403 as a rate limit', () => {
    const error = new GitHubRestError(403, { message: 'Must have admin' });
    expect(classifyError(error)).toMatchObject({
      isRateLimited: false,
      isRetryable: false,
    });
  });

  it('follows the cause chain of wrapped GraphQL errors', () => {
    const graphqlError = {
      message: 'x',
      response: {
        status: 200,
        errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }],
        headers: headers({ 'retry-after': '2' }),
      },
    };
    const wrapped = new Error('Failed to follow user.', {
      cause: graphqlError,
    });
    expect(classifyError(wrapped)).toMatchObject({
      isRateLimited: true,
      retryAfterMs: 2_000,
    });
  });

  it('retries server errors but not client errors', () => {
    expect(classifyError({ status: 502 }).isRetryable).toBe(true);
    expect(classifyError({ status: 401 }).isRetryable).toBe(false);
    expect(classifyError({ status: 404 }).isRetryable).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for Retry-After and then succeeds', async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(
        new GitHubRestError(429, {}, headers({ 'retry-after': '3' }))
      )
      .mockResolvedValue('ok');

    const promise = withRetry(task);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('gives up with a RateLimitError when the wait is too long', async () => {
    const task = vi
      .fn()
      .mockRejectedValue(
        new GitHubRestError(429, {}, headers({ 'retry-after': '3600' }))
      );

    await expect(withRetry(task)).rejects.toBeInstanceOf(RateLimitError);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-transient errors', async () => {
    const task = vi.fn().mockRejectedValue(new GitHubRestError(401, {}));
    await expect(withRetry(task)).rejects.toBeInstanceOf(GitHubRestError);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('reports rate-limit pauses so the UI can say when it resumes', async () => {
    const onPause = vi.fn();
    const task = vi
      .fn()
      .mockRejectedValueOnce(
        new GitHubRestError(429, {}, headers({ 'retry-after': '5' }))
      )
      .mockResolvedValue('ok');

    const promise = withRetry(task, { onPause });
    await vi.advanceTimersByTimeAsync(0);
    expect(onPause).toHaveBeenCalledWith(5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(promise).resolves.toBe('ok');
  });

  it('caps the total rate-limit wait across calls sharing a budget', async () => {
    const budget = createRetryBudget(5_000);
    const limited = () =>
      new GitHubRestError(429, {}, headers({ 'retry-after': '3' }));
    const first = vi
      .fn()
      .mockRejectedValueOnce(limited())
      .mockResolvedValue('ok');

    const firstPromise = withRetry(first, { budget });
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(firstPromise).resolves.toBe('ok');
    expect(budget.remainingMs).toBe(2_000);

    // Another request in the same sync may not wait past what's left.
    const second = vi.fn().mockRejectedValue(limited());
    await expect(withRetry(second, { budget })).rejects.toBeInstanceOf(
      RateLimitError
    );
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops waiting and retrying once aborted', async () => {
    const controller = new AbortController();
    const task = vi
      .fn()
      .mockRejectedValue(
        new GitHubRestError(429, {}, headers({ 'retry-after': '30' }))
      );

    const promise = withRetry(task, { signal: controller.signal });
    const rejection = expect(promise).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.advanceTimersByTimeAsync(1_000);
    controller.abort();
    await rejection;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not start when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const task = vi.fn().mockResolvedValue('ok');

    await expect(
      withRetry(task, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(task).not.toHaveBeenCalled();
  });
});
