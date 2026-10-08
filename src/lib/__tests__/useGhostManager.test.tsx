// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  removeFollowingByLogin: vi.fn(),
  persistChanges: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated' }),
}));
vi.mock('@/lib/gql/fetchers', () => ({
  removeFollowingByLogin: mocks.removeFollowingByLogin,
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

  it('treats a 404 from GitHub as a failed removal and restores the ghost', async () => {
    mocks.removeFollowingByLogin.mockResolvedValue(false);
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
