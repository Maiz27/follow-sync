import React from 'react';
import Stats from '@/components/user/stats';
import { Section } from '@/components/utils/section';
import { fetchFollows } from '@/lib/gql/fetcher';

const Dashboard = async () => {
  const data = await fetchFollows({ login: 'maiz27' });

  return (
    <Section className='my-20 grid place-items-center'>
      <Stats />
    </Section>
  );
};

export default Dashboard;
