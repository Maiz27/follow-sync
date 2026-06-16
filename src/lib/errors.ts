/**
 * Converts a thrown error into a concise, user-friendly message for toasts,
 * while logging the raw error to the console for debugging. Avoids dumping
 * GitHub's verbose technical errors (scope strings, GraphQL internals) at users.
 */
export const toUserMessage = (error: unknown, fallback: string): string => {
  if (process.env.NODE_ENV !== 'production') {
    console.error(error);
  }

  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();

  if (lower.includes('scope')) {
    return 'Missing GitHub permission. Please sign out and sign in again to grant access.';
  }
  if (
    lower.includes('rate limit') ||
    lower.includes('rate-limit') ||
    lower.includes('secondary rate') ||
    lower.includes('(403)') ||
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
