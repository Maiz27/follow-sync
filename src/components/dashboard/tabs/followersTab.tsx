import React from 'react';
import PaginatedList from '@/components/utils/paginatedList';
import EmptyState from '@/components/ui/empty-state';
import ConnectionCard from '../connectionCard';
import { UserInfoFragment } from '@/lib/gql/types';
import { LuEye } from 'react-icons/lu';

export type FollowersTabProps = {
  followers: UserInfoFragment[];
};

const FollowersTab = ({ followers }: FollowersTabProps) => {
  if (followers.length === 0) {
    return (
      <EmptyState
        icon={LuEye}
        title='No Followers'
        description="You don't have any followers yet. Keep engaging with the community!"
      />
    );
  }

  return (
    <PaginatedList
      data={followers}
      renderItem={(item) => <ConnectionCard user={item!} />}
    />
  );
};

export default FollowersTab;
