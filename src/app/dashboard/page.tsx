'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import Stats from '@/components/dashboard/stats';
import Analyzer from '@/components/dashboard/analyzer';
import { Section } from '@/components/utils/section';
import { useUserNetwork } from '@/lib/hooks/useUserNetwork';
import { getNonMutuals } from '@/lib/utils';

const ClientDashboard = () => {
  const { data: session } = useSession();
  const username = session?.user?.login;
  const { data, isLoading, isError, error } = useUserNetwork({
    username: username!,
  });

  if (isLoading) return <div>Loading...</div>;

  if (isError) return <div>Error: {error?.message}</div>;

  if (!data) return <div>No data</div>;

  const { nonMutualsFollowingYou, nonMutualsYouFollow } = getNonMutuals(
    data.network
  );

  const { followers, following } = data.network;
  return (
    <>
      <Section className='my-10 grid gap-2 py-0'>
        <Stats
          stats={{
            nonMutualsFollowingYou: nonMutualsFollowingYou.length,
            nonMutualsYouFollow: nonMutualsYouFollow.length,
            following: following?.length || 0,
            followers: followers?.length || 0,
          }}
        />
        <Analyzer
          followers={followers || []}
          following={following || []}
          oneWayOut={nonMutualsFollowingYou}
          oneWayIn={nonMutualsYouFollow}
        />
      </Section>
    </>
  );
};

export default ClientDashboard;
