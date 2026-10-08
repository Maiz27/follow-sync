'use client';

import React, { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Stats from '@/components/dashboard/stats';
import Analyzer from '@/components/dashboard/analyzer';
import DashboardSkeleton from '@/components/dashboard/dashboardSkeleton';
import ChangesSummary from '@/components/dashboard/changesSummary';
import { Section } from '@/components/utils/section';
import { Button } from '@/components/ui/button';
import { useNetworkManager } from '@/lib/hooks/useNetworkManager';
import { useNetworkStore } from '@/lib/store/network';
import { useGistStore } from '@/lib/store/gist';
import { STATS_DATA } from '@/lib/constants';
import { isAuthError, toUserMessage } from '@/lib/errors';
import { SignInButton } from '@/components/auth/buttons';
import { LuGithub } from 'react-icons/lu';

const ClientDashboard = () => {
  const { data: session } = useSession();
  const username = session?.user?.login;

  // useNetworkManager only drives the fetch lifecycle (loading/error/refetch);
  // the network data itself lives in the Zustand store, which is the single
  // source of truth read below.
  const { isPending, isError, error, refetch, isFetching } =
    useNetworkManager(username);

  const hasData = useGistStore((state) => state.timestamp !== null);
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

  // A stale cache is loaded into the store before the background refresh
  // finishes; show it right away instead of a skeleton for the whole sync.
  if (isPending && !hasData) return <DashboardSkeleton />;
  if (isError && !hasData)
    return (
      <Section className='my-10'>
        <div className='flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center'>
          <h2 className='text-xl font-bold'>Couldn&apos;t load your network</h2>
          <p className='max-w-md text-sm text-muted-foreground'>
            {toUserMessage(
              error,
              'We ran into a problem talking to GitHub. This can happen if your session expired or GitHub is rate-limiting requests.'
            )}
          </p>
          {isAuthError(error) ? (
            <SignInButton>
              <LuGithub />
              Sign in again
            </SignInButton>
          ) : (
            <Button onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? 'Retrying...' : 'Retry'}
            </Button>
          )}
        </div>
      </Section>
    );

  return (
    <Section className='my-10 grid gap-2 py-0'>
      {isError && (
        <div
          role='alert'
          className='flex flex-col gap-2 rounded-md border border-destructive/50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between'
        >
          <span>
            {toUserMessage(
              error,
              "Couldn't refresh from GitHub. Showing your last saved data."
            )}
          </span>
          {isAuthError(error) ? (
            <SignInButton>
              <LuGithub />
              Sign in again
            </SignInButton>
          ) : (
            <Button
              size='sm'
              variant='outline'
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? 'Retrying...' : 'Retry'}
            </Button>
          )}
        </div>
      )}
      <ChangesSummary />
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
