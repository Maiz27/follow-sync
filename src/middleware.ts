import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, generateNonce } from '@/lib/csp';

/**
 * Attaches a per-request nonce-based CSP to document responses. The policy is
 * set on the forwarded request too: Next.js parses the nonce from it to tag
 * its inline scripts, and `x-nonce` exposes it to the root layout.
 */
export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Documents only: skip API routes, Next's static output and image
      // optimizer, and any path with a file extension (public assets,
      // favicon, robots.txt, sitemap.xml, manifest.webmanifest).
      source: '/((?!api/|_next/static|_next/image|.*\\.[^/]+$).*)',
      // Router prefetches fetch RSC payloads, not HTML; skip the work.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
