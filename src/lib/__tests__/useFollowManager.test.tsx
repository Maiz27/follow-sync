// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  persistChanges: vi.fn(),
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/gql/fetchers', () => ({
  followUser: mocks.followUser,
  unfollowUser: mocks.unfollowUser,
}));
vi.mock('@/lib/gql/client', () => ({
  useClientAuthenticatedGraphQLClient: () => ({
    client: {},
    status: 'authenticated',
  }),
}));
vi.mock('@/lib/hooks/useCacheManager', () => ({
  useCacheManager: () => ({ persistChanges: mocks.persistChanges }),
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useNetworkStore } from '@/lib/store/network';
import type { NetworkUser } from '@/lib/types';

const user: NetworkUser = {
  __typename: 'User',
  id: 'id-octo',
  login: 'octo',
  name: null,
  avatarUrl: '',
  url: '',
  followers: { totalCount: 0 },
  following: { totalCount: 0 },
  accountType: 'user',
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

describe('useFollowManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useNetworkStore.setState({
      network: { followers: [], following: [] },
      nonMutuals: { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] },
      pendingOps: [],
    });
  });

  it('keeps a successful follow when only saving the cache fails', async () => {
    mocks.followUser.mockResolvedValue({});
    mocks.persistChanges.mockRejectedValue(new Error('gist write failed'));

    const { result } = renderHook(() => useFollowManager(), { wrapper });

    await act(async () => {
      await result.current.followMutation.mutateAsync({ user });
    });

    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalled());
    expect(
      useNetworkStore.getState().network.following.map((u) => u.login)
    ).toEqual(['octo']);
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it('rolls back when GitHub rejects the follow', async () => {
    mocks.followUser.mockRejectedValue(new Error('nope'));

    const { result } = renderHook(() => useFollowManager(), { wrapper });

    await act(async () => {
      await result.current.followMutation
        .mutateAsync({ user })
        .catch(() => undefined);
    });

    expect(useNetworkStore.getState().network.following).toEqual([]);
    expect(mocks.persistChanges).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalled();
  });
});
