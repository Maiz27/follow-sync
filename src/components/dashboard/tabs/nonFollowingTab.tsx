import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { UserInfoFragment } from '@/lib/gql/types';
import { useFollowManager } from '@/lib/hooks/useFollowManager';

type NonFollowingTabProps = {
  oneWayIn: (UserInfoFragment | null)[];
  username?: string;
};

const NonFollowingTab = ({ oneWayIn, username }: NonFollowingTabProps) => {
  const { followMutation } = useFollowManager(username);
  const { isPending, mutate } = followMutation;

  return (
    <PaginatedList
      data={oneWayIn}
      renderItem={(item) => (
        <ConnectionCard
          user={item!}
          action={{
            onClick: () => mutate(item!),
            label: 'Follow',
            loading: isPending,
          }}
        />
      )}
    />
  );
};

export default NonFollowingTab;
