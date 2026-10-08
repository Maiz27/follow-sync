// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  removeFollowingByLogin: vi.fn(),
  isFollowingLogin: vi.fn(),
  persistChanges: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated' }),
}));
vi.mock('@/lib/gql/fetchers', () => ({
  removeFollowingByLogin: mocks.removeFollowingByLogin,
  isFollowingLogin: mocks.isFollowingLogin,
}));
vi.mock('@/lib/hooks/useCacheManager', () => ({
  useCacheManager: () => ({ persistChanges: mocks.persistChanges }),
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import { useGhostManager } from '@/lib/hooks/useGhostManager';
import { useGhostStore } from '@/lib/store/ghost';
import type { NetworkUser } from '@/lib/types';

const ghost: NetworkUser = {
  __typename: 'User',
  id: 'id-ghost',
  login: 'ghost',
  name: null,
  avatarUrl: '',
  url: '',
  followers: { totalCount: 0 },
  following: { totalCount: 0 },
  accountType: 'ghost',
  removable: true,
};

describe('useGhostManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useGhostStore.setState({
      ghosts: [],
      ghostsSet: new Set(),
      removedGhostLogins: new Set(),
    });
    useGhostStore.getState().setGhosts([ghost]);
  });

  it('treats a 404 as removed when GitHub confirms the follow is gone', async () => {
    // Ghosts are usually deleted/suspended accounts, which 404 on DELETE.
    mocks.removeFollowingByLogin.mockResolvedValue(false);
    mocks.isFollowingLogin.mockResolvedValue(false);
    mocks.persistChanges.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGhostManager());

    let removed: boolean | undefined;
    await act(async () => {
      removed = await result.current.removeGhost(ghost);
    });

    expect(removed).toBe(true);
    expect(mocks.isFollowingLogin).toHaveBeenCalledWith({ login: 'ghost' });
    expect(useGhostStore.getState().ghosts).toEqual([]);
    expect(useGhostStore.getState().removedGhostLogins.has('ghost')).toBe(true);
    expect(mocks.persistChanges).toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it('treats a 404 as a failure when GitHub still lists the follow', async () => {
    mocks.removeFollowingByLogin.mockResolvedValue(false);
    mocks.isFollowingLogin.mockResolvedValue(true);
    const { result } = renderHook(() => useGhostManager());

    await act(async () => {
      await result.current.removeGhost(ghost);
    });

    expect(useGhostStore.getState().ghosts.map((g) => g.login)).toEqual([
      'ghost',
    ]);
    expect(mocks.persistChanges).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalled();
  });

  it('treats a 404 as a failure when the follow check itself fails', async () => {
    mocks.removeFollowingByLogin.mockResolvedValue(false);
    mocks.isFollowingLogin.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useGhostManager());

    await expect(result.current.removeGhostSilently(ghost)).rejects.toThrow();

    expect(useGhostStore.getState().ghosts.map((g) => g.login)).toEqual([
      'ghost',
    ]);
  });

  it('removes and persists on success', async () => {
    mocks.removeFollowingByLogin.mockResolvedValue(true);
    mocks.persistChanges.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGhostManager());

    await act(async () => {
      await result.current.removeGhost(ghost);
    });

    expect(useGhostStore.getState().ghosts).toEqual([]);
    expect(mocks.persistChanges).toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalled();
  });
});
