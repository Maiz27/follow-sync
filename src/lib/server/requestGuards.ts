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

/** `scheme://host[:port]`, lowercased and without the default port. */
const toOrigin = (protocol: string, host: string) =>
  `${protocol}//${normalizeHost(host, protocol)}`;

const originOf = (url: string | undefined) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return toOrigin(parsed.protocol, parsed.host);
  } catch {
    return null;
  }
};

/** First value of a forwarded header list (later ones come from inner proxies). */
const firstForwarded = (req: NextRequest, name: string) =>
  req.headers.get(name)?.split(',')[0]?.trim() || null;

const forwardedProtocol = (req: NextRequest) => {
  const proto = firstForwarded(req, 'x-forwarded-proto')?.toLowerCase();
  return proto === 'https' || proto === 'http' ? `${proto}:` : null;
};

/**
 * Origins (scheme, host and port) this app is served from, for this request:
 * the URL Next resolved and the Host header (with the scheme a proxy forwarded,
 * if any), the client-facing host a proxy forwarded, and the configured public
 * URL. A forwarded host without a forwarded scheme is taken to be https: a
 * proxy that rewrites the host is the public, TLS-terminating edge.
 */
const getAllowedOrigins = (req: NextRequest) => {
  const proxyProtocol = forwardedProtocol(req);
  const requestProtocol = proxyProtocol ?? req.nextUrl.protocol;
  const forwardedHost = firstForwarded(req, 'x-forwarded-host');
  const host = req.headers.get('host');
  const candidates = [
    toOrigin(requestProtocol, req.nextUrl.host),
    host ? toOrigin(requestProtocol, host) : null,
    forwardedHost ? toOrigin(proxyProtocol ?? 'https:', forwardedHost) : null,
    originOf(process.env.AUTH_URL),
    originOf(process.env.NEXTAUTH_URL),
  ];
  return new Set(
    candidates.filter((origin): origin is string => Boolean(origin))
  );
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
  // origins that proxies may have rewritten.
  if (fetchSite === 'same-origin') return true;

  const origin = req.headers.get('origin');
  if (!origin) return true; // Same-origin GETs often omit it.

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  return getAllowedOrigins(req).has(
    toOrigin(originUrl.protocol, originUrl.host)
  );
};
