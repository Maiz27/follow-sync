import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { UserInfoFragment } from '@/lib/gql/types';

type FollowingTabProps = {
  following: (UserInfoFragment | null)[];
};

const FollowingTab = ({ following }: FollowingTabProps) => {
  return (
    <PaginatedList
      data={following}
      renderItem={(item) => <ConnectionCard user={item!} />}
    />
  );
};

export default FollowingTab;
