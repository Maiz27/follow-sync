/**
 * Content Security Policy, built per request so `script-src` can carry a
 * nonce instead of `'unsafe-inline'`. Next.js reads the nonce back out of the
 * request's CSP header and stamps it on its own inline bootstrap scripts; the
 * root layout hands the same nonce to next-themes for its theme script.
 *
 * `'strict-dynamic'` lets the nonce-trusted bootstrap load the rest of the
 * chunks without listing them. The client only talks to same-origin API
 * routes (which proxy GitHub server-side), so `connect-src` is 'self', and
 * avatars are the only remote resource. `'unsafe-eval'` is development-only
 * (React Fast Refresh). `style-src 'unsafe-inline'` stays for the
 * Tailwind/next-themes injected styles.
 */
export const buildCsp = (nonce: string, isDev: boolean) =>
  [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com https://*.githubusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');

/** 128 random bits, base64-encoded; uses Web Crypto so it runs on the edge. */
export const generateNonce = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
};
