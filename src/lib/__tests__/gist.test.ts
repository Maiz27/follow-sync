import { describe, expect, it } from 'vitest';

import { serializeCache } from '@/lib/gist';
import type { CachedData } from '@/lib/types';

// Built from code points so this test file stays pure ASCII:
//   U+202E RIGHT-TO-LEFT OVERRIDE + Arabic "عمر" + U+202C POP DIRECTIONAL
//   FORMATTING + space + 😀 (U+1F600). Exactly the kind of bidirectional /
//   astral content that makes GitHub flag a gist for hidden Unicode.
const BIDI_NAME =
  String.fromCodePoint(0x202e) +
  String.fromCodePoint(0x0639, 0x0645, 0x0631) +
  String.fromCodePoint(0x202c) +
  ' ' +
  String.fromCodePoint(0x1f600);

const baseCache = (name: string): CachedData =>
  ({
    network: {
      followers: [
        {
          id: 'U_1',
          login: 'octocat',
          name,
          avatarUrl: 'https://example.com/a.png',
          url: 'https://github.com/octocat',
        },
      ],
      following: [],
    },
    ghosts: [],
    removedGhosts: [],
    timestamp: 0,
    metadata: {
      totalConnections: 1,
      fetchDuration: 0,
      cacheVersion: 1,
      ownerLogin: 'octocat',
      cacheKey: 'follow-sync:octocat:network-cache',
    },
  }) as unknown as CachedData;

describe('serializeCache', () => {
  it('produces ASCII-only output even for non-ASCII display names', () => {
    const json = serializeCache(baseCache(BIDI_NAME));

    for (const char of json) {
      expect(char.charCodeAt(0)).toBeLessThanOrEqual(0x7e);
    }
    // The RIGHT-TO-LEFT OVERRIDE is emitted as its escape sequence, not raw.
    expect(json).toContain(String.fromCharCode(92) + 'u202e');
  });

  it('round-trips losslessly back to the original data', () => {
    const original = baseCache(BIDI_NAME);

    const restored = JSON.parse(serializeCache(original)) as CachedData;

    expect(restored.network.followers[0].name).toBe(BIDI_NAME);
    expect(restored).toEqual(original);
  });

  it('leaves plain-ASCII content untouched', () => {
    expect(serializeCache(baseCache('Devy'))).toBe(
      JSON.stringify(baseCache('Devy'))
    );
  });
});
