import React from 'react';
import { UserInfoFragment } from '@/lib/gql/types';
import PaginatedList from '@/components/utils/paginatedList';
import ConnectionCard from '../connectionCard';

type GhostsTabProps = {
  ghosts: UserInfoFragment[];
  isChecking: boolean;
};

const GhostsTab = ({ ghosts, isChecking }: GhostsTabProps) => {
  if (isChecking) {
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
