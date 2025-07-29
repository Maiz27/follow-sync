import React from 'react';
import { UserInfoFragment } from '@/lib/gql/types';
import PaginatedList from '@/components/utils/paginatedList';
import ConnectionCard from '../connectionCard';

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
