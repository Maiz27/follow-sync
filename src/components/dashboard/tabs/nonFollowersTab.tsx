import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { UserInfoFragment } from '@/lib/gql/types';
import { useCacheStore } from '@/lib/store/cache';

type NonFollowersTabProps = {
  oneWayOut: (UserInfoFragment | null)[];
};

const NonFollowersTab = ({ oneWayOut }: NonFollowersTabProps) => {
  const isGhost = useCacheStore((state) => state.isGhost);

  return (
    <PaginatedList
      data={oneWayOut}
      renderItem={(item) => (
        <ConnectionCard user={item!} isGhost={isGhost(item!.login)} />
      )}
    />
  );
};

export default NonFollowersTab;
