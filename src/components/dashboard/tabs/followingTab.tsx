import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { UserInfoFragment } from '@/lib/gql/types';
import { useCacheStore } from '@/lib/store/cache';

type FollowingTabProps = {
  following: (UserInfoFragment | null)[];
};

const FollowingTab = ({ following }: FollowingTabProps) => {
  const isGhost = useCacheStore((state) => state.isGhost);

  return (
    <PaginatedList
      data={following}
      renderItem={(item) => (
        <ConnectionCard user={item!} isGhost={isGhost(item!.login)} />
      )}
    />
  );
};

export default FollowingTab;
