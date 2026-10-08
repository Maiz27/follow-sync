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
 * Reads the GitHub access token from the encrypted Auth.js session JWT,
 * server-side only. The token is stored in the httpOnly session cookie and is
 * never exposed to the browser, so every GitHub request must go through a
 * server route that calls this helper.
 *
 * `getToken` derives the cookie name (and JWT salt) from `secureCookie` and
 * reassembles chunked cookies itself.
 */
export const getGitHubToken = async (
  req: NextRequest
): Promise<string | null> => {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: usesSecureCookie(req),
  });

  const accessToken = token?.accessToken;
  return typeof accessToken === 'string' ? accessToken : null;
};
