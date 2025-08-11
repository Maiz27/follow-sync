'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import Stats from '@/components/dashboard/stats';
import Analyzer from '@/components/dashboard/analyzer';
import { Section } from '@/components/utils/section';
import { useNetworkData } from '@/lib/hooks/useNetworkManager';
import { useGhostDetector } from '@/lib/hooks/useGhostDetector';

const ClientDashboard = () => {
  const { data: session } = useSession();
  const username = session?.user?.login;

  const { isLoading, isError, error } = useNetworkData(username);

  useGhostDetector();

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error: {error?.message}</div>;

  return (
    <>
      <Section className='my-10 grid gap-2 py-0'>
        <Stats />
        <Analyzer />
      </Section>
    </>
  );
};

export default ClientDashboard;
