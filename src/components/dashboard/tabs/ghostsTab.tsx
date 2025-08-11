import React from 'react';
import { UserInfoFragment } from '@/lib/gql/types';
import PaginatedList from '@/components/utils/paginatedList';
import ConnectionCard from '../connectionCard';
import { useCacheStore } from '@/lib/store/cache';

type GhostsTabProps = {
  ghosts: UserInfoFragment[];
};

const GhostsTab = ({ ghosts }: GhostsTabProps) => {
  const { isCheckingGhosts } = useCacheStore();

  if (isCheckingGhosts) {
    return <div>Checking for ghosts...</div>;
  }

  return (
    <PaginatedList
      data={ghosts}
      renderItem={(item) => <ConnectionCard user={item!} />}
    />
  );
};

export default GhostsTab;
