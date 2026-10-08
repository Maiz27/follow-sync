import { describe, expect, it } from 'vitest';

import { csvEscape, toExternalUrl, usersToCSV } from '@/lib/utils';
import type { NetworkUser } from '@/lib/types';

const makeUser = (login: string, name: string | null): NetworkUser => ({
  __typename: 'User',
  id: `id-${login}`,
  login,
  name,
  avatarUrl: '',
  url: '',
  followers: { totalCount: 3 },
  following: { totalCount: 4 },
  accountType: 'user',
});

describe('csvEscape', () => {
  it.each(['=1+1', '+SUM(A1)', '-2', '@cmd', '\tx', '\rx'])(
    'neutralizes formula-looking text %j',
    (value) => {
      expect(csvEscape(value).replace(/^"|"$/g, '').startsWith("'")).toBe(true);
    }
  );

  it('quotes cells with commas, quotes and newlines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"');
  });

  it('leaves plain text and numbers untouched', () => {
    expect(csvEscape('octocat')).toBe('octocat');
    expect(csvEscape(42)).toBe('42');
  });
});

describe('usersToCSV', () => {
  it('escapes a malicious display name', () => {
    const csv = usersToCSV([makeUser('evil', '=HYPERLINK("http://x")')]);
    const [, row] = csv.split('\n');
    expect(row).toBe(
      `evil,"'=HYPERLINK(""http://x"")",https://github.com/evil,3,4,user`
    );
  });
});

describe('toExternalUrl', () => {
  it('adds https:// to scheme-less websites', () => {
    expect(toExternalUrl('example.com')).toBe('https://example.com');
    expect(toExternalUrl('  blog.dev/me ')).toBe('https://blog.dev/me');
  });

  it('keeps explicit http(s) URLs and ignores empty values', () => {
    expect(toExternalUrl('http://a.b')).toBe('http://a.b');
    expect(toExternalUrl('HTTPS://a.b')).toBe('HTTPS://a.b');
    expect(toExternalUrl('')).toBeUndefined();
    expect(toExternalUrl(null)).toBeUndefined();
  });
});
