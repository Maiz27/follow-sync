import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import { fetchAllUserFollowersAndFollowing } from '@/lib/gql/fetchers';
import { findCacheGist, parseCache, writeCache, CachedData } from '@/lib/gist';
import {
  QUERY_KEY_USER_NETWORK,
  STALE_TIME_LARGE,
  STALE_TIME_MEDIUM,
  STALE_TIME_SMALL,
} from '@/lib/constants';
import { useProgress } from '../context/progress';

/**
 * A hook that handles all network data logic:
 * 1. Checks for cached Gist data.
 * 2. If cache is fresh, returns it.
 * 3. If cache is stale or absent, fetches from the network.
 * 4. Provides a manual refetch function.
 */
export const useNetworkData = (username?: string) => {
  const { client, status: authStatus } = useClientAuthenticatedGraphQLClient();
  const { data: session } = useSession();
  const { show, update, complete, fail } = useProgress();

  return useQuery<CachedData>({
    queryKey: [QUERY_KEY_USER_NETWORK, username],
    queryFn: async () => {
      if (!client || !username || !session) {
        throw new Error('Client, username, or session not available.');
      }

      // --- Cache Fetch Logic ---
      // Check for Gist data before deciding to fetch
      const foundGist = await findCacheGist(client);
      if (foundGist) {
        console.log('Found Cache from gist', foundGist);
        const cachedData = parseCache(foundGist);
        if (cachedData) {
          const totalConnections = cachedData.metadata.totalConnections;
          let staleTime = 0;

          if (totalConnections < 2000) staleTime = STALE_TIME_SMALL;
          else if (totalConnections < 10000) staleTime = STALE_TIME_MEDIUM;
          else staleTime = STALE_TIME_LARGE;

          const isStale = Date.now() - cachedData.timestamp > staleTime;
          // If cache is NOT stale, return it immediately.
          if (!isStale) {
            console.log('Cache is fresh, returning data.');
            toast.info('Loaded fresh data from cache.');
            return cachedData;
          }
          // If it is stale, proceed to network fetch.
          toast.warning('Cache is stale, fetching fresh data...');
        }
      }

      // --- Network Fetch Logic ---
      // This runs if no cache exists or if the cache is stale.
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

        await writeCache(session.accessToken!, dataToCache, foundGist?.name);
        complete();
        toast.success('Successfully synced and cached your network!');
        return dataToCache;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        fail({ message: err.message || 'Failed to sync network.' });
        throw err;
      }
    },
    enabled: !!client && authStatus === 'authenticated' && !!session,
    retry: false,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
};
