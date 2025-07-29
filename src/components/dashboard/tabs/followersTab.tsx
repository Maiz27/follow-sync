import React from 'react';
import { UserInfoFragment } from '@/lib/gql/types';
import PaginatedList from '@/components/utils/paginatedList';

export type FollowersTabProps = {
  followers: (UserInfoFragment | null)[];
};

const FollowersTab: React.FC<FollowersTabProps> = ({ followers }) => {
  console.log(followers);
  return (
    <PaginatedList
      data={followers}
      renderItem={(item) => <p>{item!.login}</p>}
    />
  );
};

export default FollowersTab;
