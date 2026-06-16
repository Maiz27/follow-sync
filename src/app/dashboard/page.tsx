'use client';

import React, { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Stats from '@/components/dashboard/stats';
import Analyzer from '@/components/dashboard/analyzer';
import DashboardSkeleton from '@/components/dashboard/dashboardSkeleton';
import { Section } from '@/components/utils/section';
import { Button } from '@/components/ui/button';
import { useNetworkManager } from '@/lib/hooks/useNetworkManager';
import { useNetworkStore } from '@/lib/store/network';
import { STATS_DATA } from '@/lib/constants';

const ClientDashboard = () => {
  const { data: session } = useSession();
  const username = session?.user?.login;

  // useNetworkManager only drives the fetch lifecycle (loading/error/refetch);
  // the network data itself lives in the Zustand store, which is the single
  // source of truth read below.
  const { isPending, isError, error, refetch, isFetching } =
    useNetworkManager(username);

  const followers = useNetworkStore((state) => state.network.followers);
  const following = useNetworkStore((state) => state.network.following);
  // getNonMutuals already excludes organizations and ghosts (by accountType),
  // and ghosts never enter network.followers/following — they're held in the
  // ghost store. So these lists are the single ghost-aware source; no extra
  // ghost filtering is needed here.
  const nonMutualsFollowingYou = useNetworkStore(
    (state) => state.nonMutuals.nonMutualsFollowingYou
  );
  const nonMutualsYouFollow = useNetworkStore(
    (state) => state.nonMutuals.nonMutualsYouFollow
  );

  const statsList = useMemo(
    () => [
      { ...STATS_DATA[0], value: followers.length },
      { ...STATS_DATA[1], value: following.length },
      { ...STATS_DATA[2], value: nonMutualsYouFollow.length },
      { ...STATS_DATA[3], value: nonMutualsFollowingYou.length },
    ],
    [
      followers.length,
      following.length,
      nonMutualsYouFollow.length,
      nonMutualsFollowingYou.length,
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
        nonMutualsYouFollow={nonMutualsYouFollow}
        nonMutualsFollowingYou={nonMutualsFollowingYou}
      />
    </Section>
  );
};

export default ClientDashboard;
