import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import TabManager from '../utils/tabsManager';
import { UserInfoFragment } from '@/lib/gql/types';
import FollowersTab from './tabs/followersTab';
import { formatNumber, timeAgo } from '@/lib/utils';
import FollowingTab from './tabs/followingTab';
import NonFollowersTab from './tabs/nonFollowersTab';
import NonFollowingTab from './tabs/nonFollowingTab';
import GhostsTab from './tabs/ghostsTab';
import { IoSync } from 'react-icons/io5';

type AnalyzerProps = {
  lastSync: number;
  network: {
    followers: (UserInfoFragment | null)[];
    following: (UserInfoFragment | null)[];
    oneWayOut: (UserInfoFragment | null)[];
    oneWayIn: (UserInfoFragment | null)[];
  };
  ghosts: UserInfoFragment[];
  isCheckingGhosts: boolean;
};

const Analyzer = ({
  lastSync,
  network: { followers, following, oneWayOut, oneWayIn },
  ghosts,
  isCheckingGhosts,
}: AnalyzerProps) => {
  const networkTabsData = [
    {
      id: 'followers',
      label: `Audience (${formatNumber(followers.length)})`,
      component: <FollowersTab followers={followers} />,
      componentProps: followers,
    },
    {
      id: 'following',
      label: `Network (${formatNumber(following.length)})`,
      component: <FollowingTab following={following} />,
      componentProps: following,
    },
    {
      id: 'one-way-out',
      label: `One-Way Out (${formatNumber(oneWayOut.length)})`,
      component: <NonFollowersTab oneWayOut={oneWayOut} />,
      componentProps: oneWayOut,
    },
    {
      id: 'one-way-in',
      label: `One-Way In (${formatNumber(oneWayIn.length)})`,
      component: <NonFollowingTab oneWayIn={oneWayIn} />,
      componentProps: oneWayIn,
    },
    {
      id: 'ghosts',
      label: `Ghosts (${formatNumber(ghosts.length)})`,
      component: <GhostsTab ghosts={ghosts} isChecking={isCheckingGhosts} />,
      componentProps: ghosts,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Network, Deep Dive</CardTitle>
        <CardDescription>
          Explore detailed lists for comprehensive network understanding.
        </CardDescription>

        <span className='flex items-center gap-2'>
          <IoSync /> Last synced: {timeAgo(lastSync)}
        </span>

        <CardContent className='h-full w-full overflow-hidden px-0'>
          <TabManager tabs={networkTabsData} defaultValue='followers' />
        </CardContent>
      </CardHeader>
    </Card>
  );
};

export default Analyzer;
