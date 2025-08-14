'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import Stats from '@/components/dashboard/stats';
import Analyzer from '@/components/dashboard/analyzer';
import DashboardSkeleton from '@/components/dashboard/dashboardSkeleton';
import { Section } from '@/components/utils/section';
import { useNetworkData } from '@/lib/hooks/useNetworkManager';
import { useGhostDetector } from '@/lib/hooks/useGhostDetector';
import { useCacheStore } from '@/lib/store/cache';
import { STATS_DATA } from '@/lib/constants';

const ClientDashboard = () => {
  const { data: session } = useSession();
  const username = session?.user?.login;

  const { isPending, isError, error, refetch, isFetching } =
    useNetworkData(username);

  const { network, nonMutuals } = useCacheStore();
  const { followers, following } = network;
  const { nonMutualsFollowingYou, nonMutualsYouFollow } = nonMutuals;

  const statsList = [
    { ...STATS_DATA[0], value: followers.length },
    { ...STATS_DATA[1], value: following.length },
    { ...STATS_DATA[2], value: nonMutualsYouFollow.length },
    { ...STATS_DATA[3], value: nonMutualsFollowingYou.length },
  ];

  useGhostDetector();

  if (isPending) return <DashboardSkeleton />;
  if (isError) return <div>Error: {error?.message}</div>;

  return (
    <>
      <Section className='my-10 grid gap-2 py-0'>
        <Stats list={statsList} />
        <Analyzer refetch={refetch} isFetching={isFetching} />
      </Section>
    </>
  );
};

export default ClientDashboard;
