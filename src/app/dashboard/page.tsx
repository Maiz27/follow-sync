'use client';

import React, { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Stats from '@/components/dashboard/stats';
import Analyzer from '@/components/dashboard/analyzer';
import DashboardSkeleton from '@/components/dashboard/dashboardSkeleton';
import { Section } from '@/components/utils/section';
import { useNetworkManager } from '@/lib/hooks/useNetworkManager';
import { useGhostDetector } from '@/lib/hooks/useGhostDetector';
import { useGhostStore } from '@/lib/store/ghost';
import { useNetworkStore } from '@/lib/store/network';
import { STATS_DATA } from '@/lib/constants';

const ClientDashboard = () => {
  const { data: session } = useSession();
  const username = session?.user?.login;

  const { isPending, isError, error, refetch, isFetching, isSuccess } =
    useNetworkManager(username);

  const followers = useNetworkStore((state) => state.network.followers);
  const following = useNetworkStore((state) => state.network.following);
  const nonMutualsFollowingYou = useNetworkStore(
    (state) => state.nonMutuals.nonMutualsFollowingYou
  );
  const nonMutualsYouFollow = useNetworkStore(
    (state) => state.nonMutuals.nonMutualsYouFollow
  );
  const ghostsSet = useGhostStore((state) => state.ghostsSet);

  const visibleNonMutualsYouFollow = useMemo(
    () => nonMutualsYouFollow.filter((user) => !ghostsSet.has(user.login)),
    [nonMutualsYouFollow, ghostsSet]
  );
  const visibleNonMutualsFollowingYou = useMemo(
    () => nonMutualsFollowingYou.filter((user) => !ghostsSet.has(user.login)),
    [nonMutualsFollowingYou, ghostsSet]
  );

  const statsList = useMemo(
    () => [
      { ...STATS_DATA[0], value: followers.length },
      { ...STATS_DATA[1], value: following.length },
      { ...STATS_DATA[2], value: visibleNonMutualsYouFollow.length },
      { ...STATS_DATA[3], value: visibleNonMutualsFollowingYou.length },
    ],
    [
      followers.length,
      following.length,
      visibleNonMutualsYouFollow.length,
      visibleNonMutualsFollowingYou.length,
    ]
  );

  useGhostDetector({ isNetworkReady: isSuccess });

  if (isPending) return <DashboardSkeleton />;
  if (isError) return <div>Error: {error?.message}</div>;

  return (
    <Section className='my-10 grid gap-2 py-0'>
      <Stats list={statsList} />
      <Analyzer
        refetch={refetch}
        isFetching={isFetching}
        followers={followers}
        following={following}
        visibleNonMutualsYouFollow={visibleNonMutualsYouFollow}
        visibleNonMutualsFollowingYou={visibleNonMutualsFollowingYou}
      />
    </Section>
  );
};

export default ClientDashboard;
