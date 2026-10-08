import 'server-only';

/**
 * Upstream headers the browser needs to back off correctly when GitHub
 * throttles: `Retry-After` and the `X-RateLimit-*` family.
 */
const PASSTHROUGH_HEADERS = [
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-used',
  'x-ratelimit-resource',
];

export const buildProxyHeaders = (
  upstream: Response,
  contentType = 'application/json'
) => {
  const headers = new Headers({ 'Content-Type': contentType });
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
};
