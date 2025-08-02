import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import { QUERY_KEY_USER_NETWORK } from '@/lib/constants';
import { useCacheStore } from '@/lib/store/cache';
import { useProgress } from '@/lib/context/progress';

export const useNetworkData = (username?: string) => {
  const { client, status: authStatus } = useClientAuthenticatedGraphQLClient();
  const { data: session } = useSession();
  const { initializeAndFetchNetwork } = useCacheStore();
  const progress = useProgress();

  return useQuery({
    queryKey: [QUERY_KEY_USER_NETWORK, username],
    queryFn: async () => {
      if (!client || !username || !session?.accessToken) {
        throw new Error('Client, username, or session not available.');
      }
      const data = await initializeAndFetchNetwork(
        client,
        username,
        session.accessToken,
        progress
      );
      return data;
    },
    enabled: !!client && authStatus === 'authenticated' && !!session,
    retry: false,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
};
