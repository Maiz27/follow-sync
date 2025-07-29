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
      label: `Audience (${followers.length})`,
      component: <FollowersTab followers={followers} />,
      componentProps: followers,
    },
    {
      id: 'following',
      label: `Network (${following.length})`,
      component: <DummyComponent />,
      componentProps: following,
    },
    {
      id: 'one-way-out',
      label: `One-Way Out (${oneWayOut.length})`,
      component: <DummyComponent />,
      componentProps: oneWayOut,
    },
    {
      id: 'one-way-in',
      label: `One-Way In (${oneWayIn.length})`,
      component: <DummyComponent />,
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

const DummyComponent = () => {
  return <div>Dummy Component</div>;
};
