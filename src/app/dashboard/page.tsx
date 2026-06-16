'use client';

import React, { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Stats from '@/components/dashboard/stats';
import Analyzer from '@/components/dashboard/analyzer';
import DashboardSkeleton from '@/components/dashboard/dashboardSkeleton';
import { Section } from '@/components/utils/section';
import { Button } from '@/components/ui/button';
import { useNetworkManager } from '@/lib/hooks/useNetworkManager';
import { useGhostStore } from '@/lib/store/ghost';
import { useNetworkStore } from '@/lib/store/network';
import { STATS_DATA } from '@/lib/constants';

const ClientDashboard = () => {
  const { data: session } = useSession();
  const username = session?.user?.login;

  const { isPending, isError, error, refetch, isFetching } =
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

  if (isPending) return <DashboardSkeleton />;
  if (isError)
    return (
      <Section className='my-10'>
        <div className='flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center'>
          <h2 className='text-xl font-bold'>Couldn&apos;t load your network</h2>
          <p className='max-w-md text-sm text-muted-foreground'>
            {error?.message ||
              'We ran into a problem talking to GitHub. This can happen if your session expired or GitHub is rate-limiting requests.'}
          </p>
          <Button onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Retrying...' : 'Retry'}
          </Button>
        </div>
      </Section>
    );

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
