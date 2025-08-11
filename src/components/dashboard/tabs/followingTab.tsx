import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { UserInfoFragment } from '@/lib/gql/types';
import { useFollowManager } from '@/lib/hooks/useFollowManager';

type FollowingTabProps = {
  following: (UserInfoFragment | null)[];
  username?: string;
};

const FollowingTab = ({ following, username }: FollowingTabProps) => {
  const { unfollowMutation } = useFollowManager(username);
  const { isPending, mutate } = unfollowMutation;

  return (
    <PaginatedList
      data={following}
      renderItem={(item) => (
        <ConnectionCard
          user={item!}
          action={{
            onClick: () => mutate(item!),
            label: 'Unfollow',
            loading: isPending,
          }}
        />
      )}
    />
  );
};

export default FollowingTab;
