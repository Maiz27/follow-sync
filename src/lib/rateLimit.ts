/**
 * Error classification for GitHub calls: what is worth retrying, what is a
 * rate limit, and how long GitHub asked us to wait. Works for both REST
 * gateway errors (`GitHubRestError`) and graphql-request `ClientError`s, and
 * follows `error.cause` chains so wrapped errors keep their classification.
 */

/** Never sleep longer than this inside a single request's retry loop. */
export const MAX_INLINE_RETRY_WAIT_MS = 60_000;

type HeadersLike = { get: (name: string) => string | null } | null | undefined;

type ErrorShape = {
  status?: number;
  retryAfterMs?: number | null;
  isRateLimited?: boolean;
  message?: string;
  cause?: unknown;
  response?: {
    status?: number;
    headers?: HeadersLike;
    errors?: Array<{ type?: string; message?: string }>;
  };
};

/**
 * Reads `Retry-After` (seconds) or `X-RateLimit-Reset` (epoch seconds, only
 * when the remaining quota is 0) into a wait in milliseconds.
 */
export const getRetryAfterMs = (
  headers: HeadersLike,
  now = Date.now()
): number | null => {
  if (!headers) return null;

  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }

  if (headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(headers.get('x-ratelimit-reset'));
    if (Number.isFinite(reset) && reset > 0) {
      return Math.max(0, reset * 1000 - now);
    }
  }

  return null;
};

const RATE_LIMIT_PATTERN = /rate.?limit|abuse detection/i;

export type ErrorClassification = {
  /** GitHub throttled the request (primary or secondary rate limit). */
  isRateLimited: boolean;
  /** Transient failure (5xx, network) or a rate limit — safe to retry. */
  isRetryable: boolean;
  /** How long GitHub asked us to wait, when it said. */
  retryAfterMs: number | null;
  status: number | null;
};

const classifyOne = (error: ErrorShape): ErrorClassification => {
  const status = error.status ?? error.response?.status ?? null;
  const retryAfterMs =
    error.retryAfterMs ?? getRetryAfterMs(error.response?.headers) ?? null;
  const graphqlRateLimited = Boolean(
    error.response?.errors?.some(
      (e) =>
        e.type === 'RATE_LIMITED' || RATE_LIMIT_PATTERN.test(e.message ?? '')
    )
  );
  const isRateLimited =
    Boolean(error.isRateLimited) ||
    graphqlRateLimited ||
    status === 429 ||
    ((status === 403 || status === null) &&
      RATE_LIMIT_PATTERN.test(error.message ?? ''));

  // `fetch` network failures surface as TypeErrors without a status.
  const isNetworkError = status === null && error instanceof TypeError;
  const isServerError = status !== null && status >= 500;

  return {
    isRateLimited,
    isRetryable: isRateLimited || isServerError || isNetworkError,
    retryAfterMs,
    status,
  };
};

export const classifyError = (error: unknown): ErrorClassification => {
  let current: unknown = error;
  let result: ErrorClassification = {
    isRateLimited: false,
    isRetryable: false,
    retryAfterMs: null,
    status: null,
  };

  // Walk the cause chain (bounded), merging what each layer knows.
  for (
    let depth = 0;
    depth < 5 && current && typeof current === 'object';
    depth++
  ) {
    const next = classifyOne(current as ErrorShape);
    result = {
      isRateLimited: result.isRateLimited || next.isRateLimited,
      isRetryable: result.isRetryable || next.isRetryable,
      retryAfterMs: result.retryAfterMs ?? next.retryAfterMs,
      status: result.status ?? next.status,
    };
    current = (current as ErrorShape).cause;
  }

  return result;
};

/** Thrown when GitHub asks us to wait longer than we're willing to inline. */
export class RateLimitError extends Error {
  readonly retryAfterMs: number | null;
  readonly isRateLimited = true;

  constructor(retryAfterMs: number | null, cause?: unknown) {
    const minutes = retryAfterMs ? Math.ceil(retryAfterMs / 60_000) : null;
    super(
      minutes
        ? `GitHub rate limit reached. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
        : 'GitHub rate limit reached. Please try again later.',
      { cause }
    );
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries a task on transient failures only: 5xx, network errors and rate
 * limits. Client errors (401/403/404/422...) fail immediately — retrying them
 * just burns quota. Rate limits wait as long as GitHub asks (`Retry-After` /
 * `X-RateLimit-Reset`) when that's short; otherwise a `RateLimitError` is
 * thrown so callers can stop and tell the user when to come back.
 */
export const withRetry = async <T>(
  task: () => Promise<T>,
  {
    retries = 3,
    baseDelayMs = 500,
    maxWaitMs = MAX_INLINE_RETRY_WAIT_MS,
  }: { retries?: number; baseDelayMs?: number; maxWaitMs?: number } = {}
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      const info = classifyError(error);
      if (!info.isRetryable) throw error;

      if (info.isRateLimited) {
        // Secondary limits often come without a hint; GitHub recommends
        // waiting at least a minute before retrying.
        const wait = info.retryAfterMs ?? maxWaitMs;
        if (attempt >= retries || wait > maxWaitMs) {
          throw new RateLimitError(info.retryAfterMs, error);
        }
        await sleep(wait);
        continue;
      }

      if (attempt >= retries) throw error;
      // Exponential backoff with jitter.
      await sleep(baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 137));
    }
  }
};
