import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import {
  fetchAllUserFollowersAndFollowing,
  FetchProgress,
} from '@/lib/gql/fetchers';
import { useProgress } from '@/lib/context/progress';

interface UseUserNetworkOptions {
  username: string;
}

export const useUserNetwork = ({ username }: UseUserNetworkOptions) => {
  const { client, status: authStatus } = useClientAuthenticatedGraphQLClient();
  const { show, update, complete, fail } = useProgress();

  const queryResult = useQuery({
    queryKey: ['user-network', username],
    queryFn: async () => {
      if (!client) throw new Error('GraphQL Client not initialized.');

      show({
        title: 'Syncing Your Network',
        message: 'Fetching connections from GitHub...',
        items: [
          { label: 'Followers', current: 0, total: 0 },
          { label: 'Following', current: 0, total: 0 },
        ],
      });

      try {
        const result = await fetchAllUserFollowersAndFollowing({
          client,
          username,
          onProgress: (progress: FetchProgress) => {
            update([
              {
                label: 'Followers',
                current: progress.fetchedFollowers,
                total: progress.totalFollowers,
              },
              {
                label: 'Following',
                current: progress.fetchedFollowing,
                total: progress.totalFollowing,
              },
            ]);
          },
        });
        complete();
        return result;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to sync network.';
        fail({ message: errorMessage });
        toast.error(errorMessage);
        throw err;
      }
    },
    enabled: !!client && authStatus === 'authenticated',
    retry: false,
    staleTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  return {
    ...queryResult,
  };
};
