import { beforeEach, describe, expect, it } from 'vitest';

import { isIgnored, useIgnoreStore } from '@/lib/store/ignore';

describe('ignore store', () => {
  beforeEach(() => useIgnoreStore.getState().setIgnoredLogins([]));

  it('adds and removes logins case-insensitively', () => {
    useIgnoreStore.getState().ignore('OctoCat');
    expect(isIgnored(useIgnoreStore.getState().ignoredLogins, 'octocat')).toBe(
      true
    );

    useIgnoreStore.getState().unignore('octocat');
    expect(useIgnoreStore.getState().ignoredLogins.size).toBe(0);
  });

  it('normalizes logins loaded from the cache', () => {
    useIgnoreStore.getState().setIgnoredLogins(['A', 'b']);
    expect([...useIgnoreStore.getState().ignoredLogins]).toEqual(['a', 'b']);
  });
});
