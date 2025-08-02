import React from 'react';
import { UserInfoFragment } from '@/lib/gql/types';
import PaginatedList from '@/components/utils/paginatedList';
import ConnectionCard from '../connectionCard';
import { useCacheStore } from '@/lib/store/cache';

export type FollowersTabProps = {
  followers: (UserInfoFragment | null)[];
};

const FollowersTab = ({ followers }: FollowersTabProps) => {
  const isGhost = useCacheStore((state) => state.isGhost);

  return (
    <PaginatedList
      data={followers}
      renderItem={(item) => (
        <ConnectionCard user={item!} isGhost={isGhost(item!.login)} />
      )}
    />
  );
};

export default FollowersTab;
