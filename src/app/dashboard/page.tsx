'use client';

import React from 'react';
import Stats from '@/components/dashboard/stats';
import { Section } from '@/components/utils/section';
import { useUserNetwork } from '@/lib/hooks/useUserNetwork';
import { getNonMutuals } from '@/lib/utils';
import { useSession } from 'next-auth/react';

const ClientDashboard = () => {
  const { data: session } = useSession();
  const username = session?.user?.login;
  const { data, isLoading, isError, error } = useUserNetwork({
    username: username!,
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
