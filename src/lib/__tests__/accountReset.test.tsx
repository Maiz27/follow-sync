// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('next-auth/react', () => ({ signIn: vi.fn(), signOut }));

import { signOutAndReset } from '@/components/auth/buttons';
import { gistIdStorageKey } from '@/lib/constants';
import { useGhostStore } from '@/lib/store/ghost';
import { useGistStore } from '@/lib/store/gist';
import { useIgnoreStore } from '@/lib/store/ignore';
import { useNetworkStore } from '@/lib/store/network';
import { usePaginationStore } from '@/lib/store/pagination';
import { useSettingsStore } from '@/lib/store/settings';
import type { NetworkUser } from '@/lib/types';

const user = (login: string) => ({ id: login, login }) as NetworkUser;

describe('signOutAndReset', () => {
  beforeEach(() => window.localStorage.clear());

  it("forgets the signed-out account's data, not just its stored gist id", async () => {
    useGistStore.getState().setOwnerLogin('alice');
    useGistStore.getState().setGistName('G1');
    useGistStore.getState().setDuplicateGistCount(3);
    useNetworkStore
      .getState()
      .setNetwork({ followers: [user('fan')], following: [] });
    useNetworkStore.getState().optimisticFollow(user('crush'));
    useGhostStore.getState().setGhosts([user('ghost')]);
    useGhostStore.getState().setRemovedGhostLogins(['old']);
    useIgnoreStore.getState().ignore('spam');
    useSettingsStore.getState().setShowAvatars(false);
    usePaginationStore.getState().setCurrentPage('followers', 4);

    await signOutAndReset();

    expect(signOut).toHaveBeenCalledWith({ redirectTo: '/' });
    expect(window.localStorage.getItem(gistIdStorageKey('alice'))).toBeNull();
    expect(useGistStore.getState()).toMatchObject({
      ownerLogin: null,
      gistName: null,
      metadata: null,
      duplicateGistCount: 0,
    });
    expect(useNetworkStore.getState().network).toEqual({
      followers: [],
      following: [],
    });
    expect(useNetworkStore.getState().pendingOps).toEqual([]);
    expect(useGhostStore.getState().ghosts).toEqual([]);
    expect(useGhostStore.getState().removedGhostLogins.size).toBe(0);
    expect(useIgnoreStore.getState().ignoredLogins.size).toBe(0);
    expect(useSettingsStore.getState().showAvatars).toBe(true);
    expect(usePaginationStore.getState().pagination).toEqual({});
  });
});
