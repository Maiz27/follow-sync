export const CACHE_TOO_LARGE_MESSAGE =
  'Your network is too large to cache on this host.';

/**
 * Converts a thrown error into a concise, user-friendly message for toasts,
 * while logging the raw error to the console for debugging. Avoids dumping
 * GitHub's verbose technical errors (scope strings, GraphQL internals) at users.
 */
export const toUserMessage = (error: unknown, fallback: string): string => {
  if (process.env.NODE_ENV !== 'production') {
    console.error(error);
  }

  // Errors that carry their own user-facing explanation (e.g. a cache gist
  // that can't be read and so wasn't overwritten).
  const userMessage =
    error instanceof Error
      ? (error as Error & { userMessage?: unknown }).userMessage
      : undefined;
  if (typeof userMessage === 'string') return userMessage;

  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();

  // The host (Vercel) refuses request/response bodies over 4.5 MB. Cache
  // reads and writes are split to stay under it; this is the fallback.
  if (
    lower.includes('(413)') ||
    lower.includes('payload too large') ||
    lower.includes('function_payload_too_large')
  ) {
    return CACHE_TOO_LARGE_MESSAGE;
  }

  if (lower.includes('scope')) {
    return 'Missing GitHub permission. Please sign out and sign in again to grant access.';
  }
  // Note: a bare 403 is NOT treated as rate limiting — it commonly means a
  // permission/policy failure. Genuine rate limits carry one of the phrases
  // above (GitHub's 403/429 rate-limit bodies include "rate limit").
  if (
    lower.includes('rate limit') ||
    lower.includes('rate-limit') ||
    lower.includes('secondary rate') ||
    lower.includes('(429)')
  ) {
    return 'GitHub is rate-limiting requests right now. Please try again in a little while.';
  }
  if (
    lower.includes('unauthorized') ||
    lower.includes('(401)') ||
    lower.includes('bad credentials')
  ) {
    return 'Your session has expired. Please sign in again.';
  }
  if (lower.includes('not found') || lower.includes('(404)')) {
    return 'That account could not be found on GitHub.';
  }

  return fallback;
};

/** Whether an error means the GitHub session is no longer valid (HTTP 401). */
export const isAuthError = (error: unknown): boolean => {
  const raw = (
    error instanceof Error ? error.message : String(error ?? '')
  ).toLowerCase();
  return (
    raw.includes('(401)') ||
    raw.includes('"status":401') ||
    raw.includes('unauthorized') ||
    raw.includes('bad credentials')
  );
};
