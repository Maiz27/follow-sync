import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import { fetchAllUserFollowersAndFollowing } from '@/lib/gql/fetchers';
import { useProgress } from '@/lib/context/progress';
import { findCacheGist, parseCache, writeCache, CachedData } from '@/lib/gist';

interface UseUserNetworkOptions {
  username: string;
}

export const useUserNetwork = ({ username }: UseUserNetworkOptions) => {
  const { client, status: authStatus } = useClientAuthenticatedGraphQLClient();
  const { data: session } = useSession();
  const { show, update, complete, fail } = useProgress();

  // The query now returns the entire CachedData object.
  const queryResult = useQuery<CachedData>({
    queryKey: ['user-network', username],
    queryFn: async () => {
      if (!client || !session?.accessToken) {
        throw new Error('Client or session not available.');
      }
      const token = session.accessToken;

      // 1. Check for an existing cache first.
      const foundGist = await findCacheGist(client);
      if (foundGist) {
        const cachedData = parseCache(foundGist);
        if (cachedData) {
          console.log('Cache hit. Returning cached data.');
          return cachedData;
        }
      }

      // 2. If no cache, proceed with full network fetch.
      console.log('Cache miss. Performing full network sync.');
      const fetchStart = performance.now();
      show({
        title: 'Syncing Your Network',
        message: 'Fetching connections from GitHub...',
        items: [
          { label: 'Followers', current: 0, total: 0 },
          { label: 'Following', current: 0, total: 0 },
        ],
      });

      try {
        const networkData = await fetchAllUserFollowersAndFollowing({
          client,
          username,
          onProgress: (progress) => {
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

        const fetchEnd = performance.now();
        const fetchDuration = Math.round((fetchEnd - fetchStart) / 1000);

        // 3. Construct the cache object and write it to a new Gist.
        const dataToCache: CachedData = {
          timestamp: Date.now(),
          ghosts: [],
          network: {
            followers: networkData.followers.nodes!,
            following: networkData.following.nodes!,
          },
          metadata: {
            totalConnections:
              networkData.followers.totalCount +
              networkData.following.totalCount,
            fetchDuration,
            cacheVersion: '1.0',
          },
        };

        await writeCache(token, dataToCache);
        complete();
        toast.success('Successfully synced and cached your network!');
        return dataToCache;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to sync network.';
        fail({ message: errorMessage });
        toast.error(errorMessage);
        throw err;
      }
    },

    enabled: !!client && authStatus === 'authenticated' && !!session,
    retry: false,
    staleTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  return {
    ...queryResult,
  };
};
