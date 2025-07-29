'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Section } from '@/components/utils/section';
import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import {
  fetchAllUserFollowersAndFollowing,
  FetchProgress,
} from '@/lib/gql/fetchers';
import { useProgress } from '@/lib/context/progress';
import { getNonMutuals } from '@/lib/utils';
import Stats from '@/components/dashboard/stats';

const ClientDashboard = () => {
  const { client, status: authStatus } = useClientAuthenticatedGraphQLClient();

  const { show, update, complete, fail } = useProgress();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['user-network', 'maiz27'],
    queryFn: async () => {
      if (!client) throw new Error('GraphQL Client not initialized.');

      // Show the progress toast before starting
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
          username: 'maiz27',
          onProgress: (progress: FetchProgress) => {
            // Update the toast with new progress data
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
        // The operation is done. Mark it as complete.
        complete();
        return result;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to sync network.';
        // The operation failed. Mark it as such.
        fail({ message: errorMessage });
        toast.error(errorMessage);
        throw err; // Re-throw for React Query
      }
    },
    enabled: !!client && authStatus === 'authenticated',
    retry: false,
    staleTime: 1000 * 60 * 60,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <div>Loading...</div>;

  if (isError) return <div>Error: {error?.message}</div>;

  if (!data) return <div>No data</div>;

  const { followers, following } = data!;

  const { nonMutualsFollowingYou, nonMutualsYouFollow } = getNonMutuals({
    followers,
    following,
  });

  return (
    <>
      <Section className='my-10 gap-2 py-0'>
        <Stats
          stats={{
            nonMutualsFollowingYou,
            nonMutualsYouFollow,
            following: following.totalCount,
            followers: followers.totalCount,
          }}
        />
      </Section>
    </>
  );
};

export default ClientDashboard;
