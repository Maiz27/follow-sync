import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { UserInfoFragment } from '@/lib/gql/types';
import { useFollowManager } from '@/lib/hooks/useFollowManager';

type NonFollowingTabProps = {
  oneWayIn: (UserInfoFragment | null)[];
};

const NonFollowingTab = ({ oneWayIn }: NonFollowingTabProps) => {
  const { followMutation } = useFollowManager();
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
