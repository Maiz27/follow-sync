import React, { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import TabManager from '../utils/tabsManager';
import FollowersTab from './tabs/followersTab';
import FollowingTab from './tabs/followingTab';
import NonFollowersTab from './tabs/nonFollowersTab';
import NonFollowingTab from './tabs/nonFollowingTab';
import GhostsTab from './tabs/ghostsTab';
import { Button } from '../ui/button';
import UserSettings from '../user/userSettings';
import { useGistStore } from '@/lib/store/gist';
import { useGhostStore } from '@/lib/store/ghost';
import { UserInfoFragment } from '@/lib/gql/types';
import { formatNumber, timeAgo } from '@/lib/utils';
import { IoSync } from 'react-icons/io5';
import { LuLoaderCircle } from 'react-icons/lu';

interface AnalyzerProps {
  refetch: () => void;
  isFetching: boolean;
  followers: UserInfoFragment[];
  following: UserInfoFragment[];
  visibleNonMutualsYouFollow: UserInfoFragment[];
  visibleNonMutualsFollowingYou: UserInfoFragment[];
}

const Analyzer = ({
  refetch,
  isFetching,
  followers,
  following,
  visibleNonMutualsYouFollow,
  visibleNonMutualsFollowingYou,
}: AnalyzerProps) => {
  const ghosts = useGhostStore((state) => state.ghosts);
  const isCheckingGhosts = useGhostStore((state) => state.isCheckingGhosts);
  const timestamp = useGistStore((state) => state.timestamp);

  const networkTabsData = useMemo(
    () => [
      {
        id: 'followers',
        label: `Audience (${formatNumber(followers.length)})`,
        component: <FollowersTab followers={followers} />,
      },
      {
        id: 'following',
        label: `Network (${formatNumber(following.length)})`,
        component: <FollowingTab following={following} />,
      },
      {
        id: 'one-way-out',
        label: `One-Way Out (${formatNumber(visibleNonMutualsYouFollow.length)})`,
        component: <NonFollowersTab oneWayOut={visibleNonMutualsYouFollow} />,
      },
      {
        id: 'one-way-in',
        label: `One-Way In (${formatNumber(visibleNonMutualsFollowingYou.length)})`,
        component: <NonFollowingTab oneWayIn={visibleNonMutualsFollowingYou} />,
      },
      {
        id: 'ghosts',
        label: isCheckingGhosts ? (
          <span className='inline-flex items-center gap-2'>
            Ghosts
            <LuLoaderCircle className='size-4 animate-spin' />
          </span>
        ) : (
          `Ghosts (${formatNumber(ghosts.length)})`
        ),
        component: <GhostsTab ghosts={ghosts} />,
      },
    ],
    [
      followers,
      following,
      visibleNonMutualsYouFollow,
      visibleNonMutualsFollowingYou,
      ghosts,
      isCheckingGhosts,
    ]
  );

  return (
    <Card>
      <CardHeader>
        <div className='mb-2 flex flex-col justify-between md:flex-row md:items-center'>
          <div>
            <CardTitle>Your Network, Deep Dive</CardTitle>
            <CardDescription>
              Explore detailed lists for comprehensive network understanding.
            </CardDescription>
          </div>

          <UserSettings />
        </div>

        <div className='mb-2 flex flex-col justify-between md:flex-row md:items-center'>
          <span className='flex items-center gap-2'>
            <IoSync /> Last synced: {timeAgo(timestamp!)}
          </span>
          <Button size='sm' onClick={() => refetch()} disabled={isFetching}>
            <IoSync className={isFetching ? 'animate-spin' : ''} />
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        <CardContent className='h-full w-full overflow-hidden px-0'>
          <TabManager tabs={networkTabsData} defaultValue='followers' />
        </CardContent>
      </CardHeader>
    </Card>
  );
};

export default Analyzer;
