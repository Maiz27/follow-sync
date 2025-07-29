import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { UserInfoFragment } from '@/lib/gql/types';

type NonFollowingTabProps = {
  oneWayIn: (UserInfoFragment | null)[];
};

const NonFollowingTab = ({ oneWayIn }: NonFollowingTabProps) => {
  return (
    <PaginatedList
      data={oneWayIn}
      renderItem={(item) => <ConnectionCard user={item!} />}
    />
  );
};

export default NonFollowingTab;
