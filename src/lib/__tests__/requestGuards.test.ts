import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { isSameOriginRequest } from '@/lib/server/requestGuards';

const request = (headers: Record<string, string>) =>
  new NextRequest('https://app.example/api/gh/graphql', {
    method: 'POST',
    headers: { host: 'app.example', ...headers },
  });

describe('isSameOriginRequest', () => {
  it('accepts same-origin requests', () => {
    expect(
      isSameOriginRequest(
        request({
          origin: 'https://app.example',
          'sec-fetch-site': 'same-origin',
        })
      )
    ).toBe(true);
  });

  it('accepts requests without Origin (same-origin GET)', () => {
    expect(isSameOriginRequest(request({}))).toBe(true);
  });

  it('rejects a foreign Origin', () => {
    expect(
      isSameOriginRequest(request({ origin: 'https://evil.example' }))
    ).toBe(false);
  });

  it('rejects an Origin with the same host but another scheme', () => {
    expect(isSameOriginRequest(request({ origin: 'http://app.example' }))).toBe(
      false
    );
  });

  it('rejects cross-site fetch metadata', () => {
    expect(
      isSameOriginRequest(request({ 'sec-fetch-site': 'cross-site' }))
    ).toBe(false);
  });

  describe('behind a proxy', () => {
    // The app sees an internal URL/Host; the public host arrives forwarded.
    const proxied = (headers: Record<string, string>) =>
      new NextRequest('http://localhost:3000/api/gh/graphql', {
        method: 'POST',
        headers: { host: 'localhost:3000', ...headers },
      });

    afterEach(() => vi.unstubAllEnvs());

    it('trusts Sec-Fetch-Site: same-origin', () => {
      expect(
        isSameOriginRequest(
          proxied({
            origin: 'https://app.example',
            'sec-fetch-site': 'same-origin',
          })
        )
      ).toBe(true);
    });

    it('uses only the first value of a forwarded host list', () => {
      expect(
        isSameOriginRequest(
          proxied({
            origin: 'https://app.example',
            'x-forwarded-host': 'app.example, internal-lb.local',
          })
        )
      ).toBe(true);
      expect(
        isSameOriginRequest(
          proxied({
            origin: 'https://evil.example',
            'x-forwarded-host': 'app.example, evil.example',
          })
        )
      ).toBe(false);
    });

    it('ignores default ports when comparing hosts', () => {
      expect(
        isSameOriginRequest(
          proxied({
            origin: 'https://app.example',
            'x-forwarded-host': 'app.example:443',
          })
        )
      ).toBe(true);
      expect(
        isSameOriginRequest(
          proxied({
            origin: 'https://app.example:8443',
            'x-forwarded-host': 'app.example',
          })
        )
      ).toBe(false);
    });

    it('accepts the configured AUTH_URL origin', () => {
      vi.stubEnv('AUTH_URL', 'https://app.example/api/auth');
      expect(
        isSameOriginRequest(proxied({ origin: 'https://app.example' }))
      ).toBe(true);
      expect(
        isSameOriginRequest(proxied({ origin: 'https://evil.example' }))
      ).toBe(false);
    });

    it('compares the scheme the proxy forwarded', () => {
      expect(
        isSameOriginRequest(
          proxied({
            origin: 'https://app.example',
            'x-forwarded-host': 'app.example',
            'x-forwarded-proto': 'https',
          })
        )
      ).toBe(true);
      expect(
        isSameOriginRequest(
          proxied({
            origin: 'http://app.example',
            'x-forwarded-host': 'app.example',
            'x-forwarded-proto': 'https',
          })
        )
      ).toBe(false);
      // A proxy that preserves the Host header and forwards only the scheme.
      expect(
        isSameOriginRequest(
          new NextRequest('http://app.example/api/gh/graphql', {
            method: 'POST',
            headers: {
              host: 'app.example',
              origin: 'https://app.example',
              'x-forwarded-proto': 'https, http',
            },
          })
        )
      ).toBe(true);
    });

    it('assumes https for a forwarded host without a forwarded scheme', () => {
      expect(
        isSameOriginRequest(
          proxied({
            origin: 'http://app.example',
            'x-forwarded-host': 'app.example',
          })
        )
      ).toBe(false);
    });

    it('rejects the configured AUTH_URL host under another scheme', () => {
      vi.stubEnv('AUTH_URL', 'https://app.example/api/auth');
      expect(
        isSameOriginRequest(proxied({ origin: 'http://app.example' }))
      ).toBe(false);
    });

    it('still rejects cross-site and same-site requests', () => {
      expect(
        isSameOriginRequest(
          proxied({
            origin: 'https://app.example',
            'x-forwarded-host': 'app.example',
            'sec-fetch-site': 'cross-site',
          })
        )
      ).toBe(false);
      expect(
        isSameOriginRequest(
          proxied({
            origin: 'https://sub.app.example',
            'sec-fetch-site': 'same-site',
          })
        )
      ).toBe(false);
    });
  });
});
