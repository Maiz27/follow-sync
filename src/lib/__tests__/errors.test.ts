import { describe, expect, it, vi } from 'vitest';

import { CACHE_TOO_LARGE_MESSAGE, toUserMessage } from '@/lib/errors';
import { GitHubRestError } from '@/lib/ghRest';

describe('toUserMessage', () => {
  it.each([
    ['the proxy', { error: 'Payload too large for this host.' }],
    ['Vercel', 'Request Entity Too Large FUNCTION_PAYLOAD_TOO_LARGE'],
  ])('explains a 413 from %s as a cache that is too large', (_, body) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(toUserMessage(new GitHubRestError(413, body), 'fallback')).toBe(
      CACHE_TOO_LARGE_MESSAGE
    );
  });

  it('keeps the fallback for unrelated errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(toUserMessage(new GitHubRestError(500, {}), 'fallback')).toBe(
      'fallback'
    );
  });
});
