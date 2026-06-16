import { GH_REST_PROXY } from '@/lib/constants';

/**
 * Thrown by the gateway for any non-2xx response that isn't a caller-tolerated
 * 404. Carries the HTTP status and parsed error body. The message keeps the
 * `(<status>)` shape that `toUserMessage` pattern-matches on, so rate-limit /
 * auth / not-found toasts keep working through the gateway.
 */
export class GitHubRestError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`GitHub request failed (${status}): ${JSON.stringify(body)}`);
    this.name = 'GitHubRestError';
    this.status = status;
    this.body = body;
  }
}

const toUrl = (path: string) =>
  `${GH_REST_PROXY}${path.startsWith('/') ? path : `/${path}`}`;

const parseErrorBody = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return await response.text().catch(() => null);
  }
};

/**
 * Single entry point for same-origin GitHub REST calls (through the BFF proxy).
 * Owns the proxy base URL, JSON parsing, the 404/204 -> null convention, and
 * error extraction so callers don't re-implement fetch boilerplate.
 *
 * Resolves to the parsed JSON body, `null` for 404 (absent) or 204 (no
 * content), and throws {@link GitHubRestError} for any other non-2xx status.
 */
export const ghRest = async <T>(
  path: string,
  init?: RequestInit
): Promise<T | null> => {
  const response = await fetch(toUrl(path), init);

  if (response.status === 404 || response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw new GitHubRestError(response.status, await parseErrorBody(response));
  }

  return (await response.json()) as T;
};

/**
 * Variant for mutations whose only meaningful result is success vs. absence
 * (e.g. DELETE follow, DELETE gist). Returns `true` on any 2xx, `false` on 404,
 * and throws {@link GitHubRestError} otherwise.
 */
export const ghRestOk = async (
  path: string,
  init?: RequestInit
): Promise<boolean> => {
  const response = await fetch(toUrl(path), init);

  if (response.status === 404) return false;

  if (!response.ok) {
    throw new GitHubRestError(response.status, await parseErrorBody(response));
  }

  return true;
};
