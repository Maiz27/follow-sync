import React from 'react';
import Stats from '@/components/dashboard/stats';
import Analyzer from './analyzer';
import { Section } from '@/components/utils/section';
import {
  fetchAllFollowersLogin,
  fetchAllFollowingLogin,
} from '@/lib/gql/fetchers';
import { getFollowStats } from '@/lib/utils';

const Dashboard = async () => {
  const [followerResult, followingResult] = await Promise.allSettled([
    fetchAllFollowersLogin({ login: 'maiz27' }),
    fetchAllFollowingLogin({ login: 'maiz27' }),
  ]);

  // Check the status of each promise
  if (
    followerResult.status !== 'fulfilled' ||
    followingResult.status !== 'fulfilled'
  ) {
    // You might want more sophisticated error handling here,
    // e.g., displaying specific error messages.
    // For now, a generic loading/error message suffices.
    console.error('Failed to fetch one or both follow lists.');
    if (followerResult.status === 'rejected') {
      console.error('Follower fetch failed:', followerResult.reason);
    }
    if (followingResult.status === 'rejected') {
      console.error('Following fetch failed:', followingResult.reason);
    }
    return (
      <Section className='grid place-items-center'>
        <div>Error loading follow data. Please try again.</div>
      </Section>
    );
  }

  const stats = getFollowStats({
    followers: followerResult.value!,
    followings: followingResult.value!,
  });

  return (
    <Section className='my-0 grid place-items-center py-0'>
      <Stats stats={stats} />
      <Analyzer />
    </Section>
  );
};

export default Dashboard;
