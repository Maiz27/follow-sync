import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import { QUERY_KEY_USER_NETWORK } from '@/lib/constants';
import { useProgress } from '@/lib/context/progress';
import { useCacheManager } from './useCacheManager';
import { useGistStore } from '../store/gist';

export const useNetworkManager = (username?: string) => {
  const { client, status: authStatus } = useClientAuthenticatedGraphQLClient();
  const { data: session } = useSession();
  const { initializeAndFetchNetwork } = useCacheManager();
  const setForceNextRefresh = useGistStore(
    (state) => state.setForceNextRefresh
  );
  const progress = useProgress();

  // The key is the account. The client, session and progress callbacks are
  // plumbing that changes identity across renders, not inputs that should
  // refetch (and re-sync from GitHub) when they do.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const queryResult = useQuery({
    queryKey: [QUERY_KEY_USER_NETWORK, username],
    queryFn: async () => {
      if (!client || !username || !session) {
        throw new Error('Client, username, or session not available.');
      }
      const data = await initializeAndFetchNetwork(client, username, progress);
      return data;
    },
    enabled: !!client && authStatus === 'authenticated' && !!session,
    retry: false,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const forceRefetch = async () => {
    setForceNextRefresh(true);
    await queryResult.refetch();
  };

  return {
    data: queryResult.data,
    error: queryResult.error,
    isPending: queryResult.isPending,
    isError: queryResult.isError,
    isFetching: queryResult.isFetching,
    refetch: forceRefetch,
  };
};
