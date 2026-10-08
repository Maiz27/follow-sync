import 'server-only';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

const SECURE_COOKIE_PREFIX = '__Secure-authjs.session-token';

/**
 * Whether Auth.js issued the session cookie with the `__Secure-` prefix. It
 * does so whenever the app is served over HTTPS. Large sessions are split into
 * chunks (`<name>.0`, `<name>.1`, ...), so checking for the exact cookie name
 * misses them — look at the request protocol and match the prefix instead.
 */
const usesSecureCookie = (req: NextRequest) => {
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0];
  if (req.nextUrl.protocol === 'https:' || forwardedProto?.trim() === 'https') {
    return true;
  }
  return req.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith(SECURE_COOKIE_PREFIX));
};

/**
 * The secrets Auth.js itself uses for the session JWT, in the same order, so
 * a token it issued always decodes here — including during a secret rotation.
 *
 * Mirrors next-auth's `setEnvDefaults` (next-auth/lib/env.js) and
 * @auth/core's (lib/utils/env.js): `AUTH_SECRET` (or `NEXTAUTH_SECRET`) when
 * set; otherwise `AUTH_SECRET_1..3`, with the highest number first (it
 * encrypts new tokens; the older ones still decode existing cookies).
 */
export const resolveAuthSecrets = (
  env: Record<string, string | undefined> = process.env
): string[] => {
  const primary = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET;
  if (primary) return [primary];

  const rotated: string[] = [];
  for (const i of [1, 2, 3]) {
    const secret = env[`AUTH_SECRET_${i}`];
    if (secret) rotated.unshift(secret);
  }
  return rotated;
};

let warnedMissingSecret = false;

/**
 * Reads the GitHub access token from the encrypted Auth.js session JWT,
 * server-side only. The token is stored in the httpOnly session cookie and is
 * never exposed to the browser, so every GitHub request must go through a
 * server route that calls this helper.
 *
 * `getToken` derives the cookie name (and JWT salt) from `secureCookie` and
 * reassembles chunked cookies itself. Returns null (the routes answer 401)
 * when the deployment has no auth secret at all, rather than letting
 * `getToken` throw `MissingSecret` into a 500.
 */
export const getGitHubToken = async (
  req: NextRequest
): Promise<string | null> => {
  const secrets = resolveAuthSecrets();
  if (secrets.length === 0) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.error(
        '[auth] No AUTH_SECRET (or AUTH_SECRET_1..3) is configured; GitHub proxy requests are refused as unauthenticated.'
      );
    }
    return null;
  }

  const token = await getToken({
    req,
    secret: secrets,
    secureCookie: usesSecureCookie(req),
  });

  const accessToken = token?.accessToken;
  return typeof accessToken === 'string' ? accessToken : null;
};
