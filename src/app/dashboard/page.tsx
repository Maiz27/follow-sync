'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Section } from '@/components/utils/section';
import { UserCard } from '@/components/user/userCard';
import { useClientAuthenticatedGraphQLClient } from '@/lib/gql/client';
import { fetchAllUserFollowersAndFollowing } from '@/lib/gql/fetchers';

const ClientDashboard = () => {
  const { client, status } = useClientAuthenticatedGraphQLClient();

  const { data } = useQuery({
    queryKey: ['user-network', ['maiz27']],
    queryFn: async () => {
      if (!client) throw new Error('GraphQL Client not initialized.');
      return fetchAllUserFollowersAndFollowing({
        client,
        username: 'maiz27',
      });
    },
    enabled: !!client && status === 'authenticated',
  });

  console.log(data);

  return (
    <>
      <Section className='my-10 grid place-items-center py-0'>
        <UserCard />
      </Section>
    </>
  );
};

export default ClientDashboard;
