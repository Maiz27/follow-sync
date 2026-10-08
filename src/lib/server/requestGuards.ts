import 'server-only';
import type { NextRequest } from 'next/server';

/**
 * Defense in depth for the GitHub proxies: only accept requests the app's own
 * pages made. The session cookie is `SameSite=Lax`, which already blocks most
 * cross-site use; this additionally rejects any request whose `Origin` or
 * `Sec-Fetch-Site` says it came from another site.
 */
export const isSameOriginRequest = (req: NextRequest) => {
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return false;
  }

  const origin = req.headers.get('origin');
  if (!origin) return true; // Same-origin GETs often omit it.

  try {
    const originHost = new URL(origin).host;
    const requestHost =
      req.headers.get('x-forwarded-host') ??
      req.headers.get('host') ??
      req.nextUrl.host;
    return originHost === requestHost;
  } catch {
    return false;
  }
};
