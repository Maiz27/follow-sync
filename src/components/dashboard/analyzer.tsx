import React from 'react';
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
import { useCacheStore } from '@/lib/store/cache';
import { formatNumber, timeAgo } from '@/lib/utils';
import { IoSync } from 'react-icons/io5';

interface AnalyzerProps {
  refetch: () => void;
  isFetching: boolean;
}

const Analyzer = ({ refetch, isFetching }: AnalyzerProps) => {
  const { network, nonMutuals, ghosts, timestamp } = useCacheStore();
  const { followers, following } = network;
  const { nonMutualsFollowingYou, nonMutualsYouFollow } = nonMutuals;

  const networkTabsData = [
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
      label: `One-Way Out (${formatNumber(nonMutualsYouFollow.length)})`,
      component: <NonFollowersTab oneWayOut={nonMutualsYouFollow} />,
    },
    {
      id: 'one-way-in',
      label: `One-Way In (${formatNumber(nonMutualsFollowingYou.length)})`,
      component: <NonFollowingTab oneWayIn={nonMutualsFollowingYou} />,
    },
    {
      id: 'ghosts',
      label: `Ghosts (${formatNumber(ghosts.length)})`,
      component: <GhostsTab ghosts={ghosts} />,
    },
  ];

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
