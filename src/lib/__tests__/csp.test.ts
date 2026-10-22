import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  unstable_doesMiddlewareMatch,
  unstable_getResponseFromNextConfig,
} from 'next/experimental/testing/server';
import nextConfig from '../../../next.config';
import { config, middleware } from '@/middleware';
import { buildCsp, generateNonce } from '@/lib/csp';

const scriptSrc = (csp: string) =>
  csp.split('; ').find((d) => d.startsWith('script-src '));

describe('buildCsp', () => {
  it('allows scripts by nonce, never unsafe-inline', () => {
    const csp = buildCsp('abc123', false);
    expect(scriptSrc(csp)).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic'"
    );
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('adds unsafe-eval only in development', () => {
    expect(scriptSrc(buildCsp('abc123', true))).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' 'unsafe-eval'"
    );
  });

  it('keeps the other directives unchanged', () => {
    const directives = buildCsp('n', false).split('; ');
    expect(directives).toEqual(
      expect.arrayContaining([
        "default-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://avatars.githubusercontent.com https://*.githubusercontent.com",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        'upgrade-insecure-requests',
      ])
    );
    expect(directives).toHaveLength(11);
  });
});

describe('generateNonce', () => {
  it('returns a fresh base64 value each call', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
  });
});

describe('middleware', () => {
  const run = () => middleware(new NextRequest('https://app.example/'));

  it('sets a nonce CSP on the response and forwards the nonce', () => {
    const response = run();
    const csp = response.headers.get('content-security-policy')!;
    const forwardedNonce = response.headers.get('x-middleware-request-x-nonce');
    const forwardedCsp = response.headers.get(
      'x-middleware-request-content-security-policy'
    );

    expect(forwardedNonce).toBeTruthy();
    expect(csp).toContain(`'nonce-${forwardedNonce}'`);
    expect(scriptSrc(csp)).not.toContain('unsafe-inline');
    // Next.js reads the nonce from the request's CSP header.
    expect(forwardedCsp).toBe(csp);
  });

  it('uses a different nonce per request', () => {
    expect(run().headers.get('x-middleware-request-x-nonce')).not.toBe(
      run().headers.get('x-middleware-request-x-nonce')
    );
  });
});

describe('middleware matcher', () => {
  const matches = (url: string, headers?: Record<string, string>) =>
    unstable_doesMiddlewareMatch({
      config,
      url: `https://app.example${url}`,
      headers,
    });

  it.each(['/', '/terms', '/privacy', '/dashboard'])(
    'runs on document route %s',
    (url) => expect(matches(url)).toBe(true)
  );

  it.each([
    '/api/gh/graphql',
    '/api/auth/session',
    '/_next/static/chunks/main.js',
    '/_next/image?url=x',
    '/imgs/logo/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/manifest.webmanifest',
  ])('skips %s', (url) => expect(matches(url)).toBe(false));

  it('skips router prefetches', () => {
    expect(matches('/terms', { 'next-router-prefetch': '1' })).toBe(false);
  });
});

describe('next.config headers', () => {
  it.each(['/', '/api/gh/graphql'])(
    'sends the static security headers on %s without a CSP',
    async (url) => {
      const response = await unstable_getResponseFromNextConfig({
        url: `https://app.example${url}`,
        nextConfig,
      });
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('strict-transport-security')).toBeTruthy();
      expect(response.headers.get('referrer-policy')).toBe(
        'strict-origin-when-cross-origin'
      );
      expect(response.headers.get('permissions-policy')).toBeTruthy();
      expect(response.headers.get('content-security-policy')).toBeNull();
    }
  );
});
