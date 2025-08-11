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
import { formatNumber, timeAgo } from '@/lib/utils';
import FollowingTab from './tabs/followingTab';
import NonFollowersTab from './tabs/nonFollowersTab';
import NonFollowingTab from './tabs/nonFollowingTab';
import GhostsTab from './tabs/ghostsTab';
import { IoSync } from 'react-icons/io5';
import { useCacheStore } from '@/lib/store/cache';

const Analyzer = () => {
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
        <CardTitle>Your Network, Deep Dive</CardTitle>
        <CardDescription>
          Explore detailed lists for comprehensive network understanding.
        </CardDescription>

        <span className='flex items-center gap-2'>
          <IoSync /> Last synced: {timeAgo(timestamp!)}
        </span>

        <CardContent className='h-full w-full overflow-hidden px-0'>
          <TabManager tabs={networkTabsData} defaultValue='followers' />
        </CardContent>
      </CardHeader>
    </Card>
  );
};

export default Analyzer;
