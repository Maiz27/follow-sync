import { describe, expect, it, vi } from 'vitest';

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

  it('rejects cross-site fetch metadata', () => {
    expect(
      isSameOriginRequest(request({ 'sec-fetch-site': 'cross-site' }))
    ).toBe(false);
  });
});
