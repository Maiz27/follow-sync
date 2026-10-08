// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { type ReactNode } from 'react';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'unauthenticated', data: null }),
}));
vi.mock('@/lib/gql/client', () => ({
  useClientAuthenticatedGraphQLClient: () => ({
    client: null,
    status: 'unauthenticated',
  }),
}));
vi.mock('@/lib/hooks/useCacheManager', () => ({
  useCacheManager: () => ({ initializeAndFetchNetwork: vi.fn() }),
}));
vi.mock('@/lib/context/progress', () => ({ useProgress: () => ({}) }));

import { useNetworkManager } from '@/lib/hooks/useNetworkManager';
import { useGistStore } from '@/lib/store/gist';

describe('useNetworkManager', () => {
  it('does not re-render when unrelated gist store fields change', () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    let renders = 0;
    renderHook(
      () => {
        renders++;
        return useNetworkManager('octocat');
      },
      { wrapper }
    );
    const before = renders;

    act(() => {
      useGistStore.getState().setDuplicateGistCount(3);
      useGistStore.getState().setLastDiff(null);
      useGistStore.setState({ timestamp: Date.now() });
    });

    expect(renders).toBe(before);
  });
});
