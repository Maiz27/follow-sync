// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { clearUserStorage } from '@/lib/storage';
import { useGistStore } from '@/lib/store/gist';
import { LEGACY_GIST_ID_STORAGE_KEY, gistIdStorageKey } from '@/lib/constants';

describe('account-scoped storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useGistStore.setState({ ownerLogin: null, gistName: null });
  });

  it('stores the gist id per account', () => {
    useGistStore.getState().setOwnerLogin('Alice');
    useGistStore.getState().setGistName('gist-a');
    useGistStore.getState().setOwnerLogin('bob');
    useGistStore.getState().setGistName('gist-b');

    expect(window.localStorage.getItem(gistIdStorageKey('alice'))).toBe(
      'gist-a'
    );
    expect(window.localStorage.getItem(gistIdStorageKey('bob'))).toBe('gist-b');
  });

  it('does not remember a gist id before the owner is known', () => {
    useGistStore.getState().setGistName('orphan');
    expect(window.localStorage.length).toBe(0);
  });

  it('clearUserStorage removes account keys and the legacy key only', () => {
    window.localStorage.setItem(gistIdStorageKey('alice'), 'gist-a');
    window.localStorage.setItem(LEGACY_GIST_ID_STORAGE_KEY, 'old');
    window.localStorage.setItem('follow-sync:pref:onboarding', '1');

    clearUserStorage();

    expect(window.localStorage.getItem(gistIdStorageKey('alice'))).toBeNull();
    expect(window.localStorage.getItem(LEGACY_GIST_ID_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('follow-sync:pref:onboarding')).toBe(
      '1'
    );
  });
});
