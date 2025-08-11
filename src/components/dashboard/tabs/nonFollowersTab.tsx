import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { UserInfoFragment } from '@/lib/gql/types';
import { useFollowManager } from '@/lib/hooks/useFollowManager';

type NonFollowersTabProps = {
  oneWayOut: (UserInfoFragment | null)[];
  username?: string;
};

const NonFollowersTab = ({ oneWayOut, username }: NonFollowersTabProps) => {
  const { unfollowMutation } = useFollowManager(username);
  const { isPending, mutate } = unfollowMutation;

  return (
    <PaginatedList
      data={oneWayOut}
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

export default NonFollowersTab;
