import React from 'react';
import { Section } from '@/components/utils/section';
import { UserCard } from '@/components/user/userCard';

const Dashboard = () => {
  return (
    <>
      <Section className='my-10 grid place-items-center py-0'>
        <UserCard />
      </Section>
    </>
  );
};

export default Dashboard;
