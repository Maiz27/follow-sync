import React from 'react';
import PaginatedList from '@/components/utils/paginatedList';
import ConnectionCard from '../connectionCard';
import { UserInfoFragment } from '@/lib/gql/types';

export type FollowersTabProps = {
  followers: (UserInfoFragment | null)[];
};

const FollowersTab = ({ followers }: FollowersTabProps) => {
  return (
    <PaginatedList
      data={followers}
      renderItem={(item) => <ConnectionCard user={item!} />}
    />
  );
};

export default FollowersTab;
