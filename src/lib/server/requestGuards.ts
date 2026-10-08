import 'server-only';
import type { NextRequest } from 'next/server';

const DEFAULT_PORTS: Record<string, string> = {
  'https:': '443',
  'http:': '80',
};

/** Lowercased `host[:port]`, without the scheme's default port. */
const normalizeHost = (host: string, protocol: string) => {
  const value = host.trim().toLowerCase();
  const defaultPort = DEFAULT_PORTS[protocol];
  return defaultPort && value.endsWith(`:${defaultPort}`)
    ? value.slice(0, -(defaultPort.length + 1))
    : value;
};

const hostOf = (url: string | undefined) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return normalizeHost(parsed.host, parsed.protocol);
  } catch {
    return null;
  }
};

/**
 * Hosts this app is served from, for this request: the URL Next resolved,
 * the client-facing host a proxy forwarded (only the first entry of a list —
 * later ones are added by intermediate proxies), the Host header, and the
 * configured public URL.
 */
const getAllowedHosts = (req: NextRequest, protocol: string) => {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0];
  const candidates = [
    hostOf(req.nextUrl.origin),
    forwardedHost ? normalizeHost(forwardedHost, protocol) : null,
    req.headers.get('host')
      ? normalizeHost(req.headers.get('host') as string, protocol)
      : null,
    hostOf(process.env.AUTH_URL),
    hostOf(process.env.NEXTAUTH_URL),
  ];
  return new Set(candidates.filter((host): host is string => Boolean(host)));
};

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
  // The browser computed this itself, which is more reliable than comparing
  // hosts that proxies may have rewritten.
  if (fetchSite === 'same-origin') return true;

  const origin = req.headers.get('origin');
  if (!origin) return true; // Same-origin GETs often omit it.

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  return getAllowedHosts(req, originUrl.protocol).has(
    normalizeHost(originUrl.host, originUrl.protocol)
  );
};
