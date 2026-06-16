import 'server-only';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

/**
 * Reads the GitHub access token from the encrypted Auth.js session JWT,
 * server-side only. The token is stored in the httpOnly session cookie and is
 * never exposed to the browser, so every GitHub request must go through a
 * server route that calls this helper.
 *
 * Auth.js v5 names the session cookie `authjs.session-token` (dev) or
 * `__Secure-authjs.session-token` (prod) and uses that name as the JWT salt;
 * we detect whichever is present so this works in both environments.
 */
export const getGitHubToken = async (
  req: NextRequest
): Promise<string | null> => {
  const secureCookieName = '__Secure-authjs.session-token';
  const cookieName = req.cookies.has(secureCookieName)
    ? secureCookieName
    : 'authjs.session-token';

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    salt: cookieName,
    cookieName,
    secureCookie: cookieName === secureCookieName,
  });

  const accessToken = token?.accessToken;
  return typeof accessToken === 'string' ? accessToken : null;
};
