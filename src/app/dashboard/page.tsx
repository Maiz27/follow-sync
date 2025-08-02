'use client';

import React, { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Stats from '@/components/dashboard/stats';
import Analyzer from '@/components/dashboard/analyzer';
import { Section } from '@/components/utils/section';
import { useUserNetwork } from '@/lib/hooks/useUserNetwork';
import { useGhostDetector } from '@/lib/hooks/useGhostDetector';
import { getNonMutuals } from '@/lib/utils';

const ClientDashboard = () => {
  const { data: session } = useSession();
  const username = session?.user?.login;
  const { data, isLoading, isError, error } = useUserNetwork({
    username: username!,
  });

  const nonMutuals = useMemo(() => {
    if (!data) {
      return { nonMutualsFollowingYou: [], nonMutualsYouFollow: [] };
    }
    return getNonMutuals(data);
  }, [data]);

  const combinedNonMutuals = useMemo(
    () => [
      ...nonMutuals.nonMutualsFollowingYou,
      ...nonMutuals.nonMutualsYouFollow,
    ],
    [nonMutuals]
  );

  const { ghosts, isChecking } = useGhostDetector(combinedNonMutuals);

  if (isLoading) return <div>Loading...</div>;

  if (isError) return <div>Error: {error?.message}</div>;

  if (!data) return <div>No data</div>;

  const { followers, following } = data!;
  const { nonMutualsFollowingYou, nonMutualsYouFollow } = nonMutuals;

  return (
    <>
      <Section className='my-10 grid gap-2 py-0'>
        <Stats
          stats={{
            nonMutualsFollowingYou: nonMutualsFollowingYou.length,
            nonMutualsYouFollow: nonMutualsYouFollow.length,
            following: following.totalCount,
            followers: followers.totalCount,
          }}
        />
        <Analyzer
          followers={followers.nodes!}
          following={following.nodes!}
          oneWayOut={nonMutualsFollowingYou}
          oneWayIn={nonMutualsYouFollow}
          ghosts={ghosts}
          isCheckingGhosts={isChecking}
        />
      </Section>
    </>
  );
};

export default ClientDashboard;
