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
import { formatNumber } from '@/lib/utils';
import FollowingTab from './tabs/followingTab';
import NonFollowersTab from './tabs/nonFollowersTab';
import NonFollowingTab from './tabs/nonFollowingTab';

type AnalyzerProps = {
  followers: (UserInfoFragment | null)[];
  following: (UserInfoFragment | null)[];
  oneWayOut: (UserInfoFragment | null)[];
  oneWayIn: (UserInfoFragment | null)[];
};

const Analyzer = ({
  followers,
  following,
  oneWayOut,
  oneWayIn,
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
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Network, Deep Dive</CardTitle>
        <CardDescription>
          Explore detailed lists for comprehensive network understanding.
        </CardDescription>
        <CardContent className='h-full w-full px-0'>
          <TabManager tabs={networkTabsData} defaultValue='followers' />
        </CardContent>
      </CardHeader>
    </Card>
  );
};

export default Analyzer;
