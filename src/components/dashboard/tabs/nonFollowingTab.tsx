import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { UserInfoFragment } from '@/lib/gql/types';
import { useCacheStore } from '@/lib/store/cache';

type NonFollowingTabProps = {
  oneWayIn: (UserInfoFragment | null)[];
};

const NonFollowingTab = ({ oneWayIn }: NonFollowingTabProps) => {
  const isGhost = useCacheStore((state) => state.isGhost);

  return (
    <PaginatedList
      data={oneWayIn}
      renderItem={(item) => (
        <ConnectionCard user={item!} isGhost={isGhost(item!.login)} />
      )}
    />
  );
};

export default NonFollowingTab;
