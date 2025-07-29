import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { UserInfoFragment } from '@/lib/gql/types';

type NonFollowersTabProps = {
  oneWayOut: (UserInfoFragment | null)[];
};

const NonFollowersTab = ({ oneWayOut }: NonFollowersTabProps) => {
  return (
    <PaginatedList
      data={oneWayOut}
      renderItem={(item) => <ConnectionCard user={item!} />}
    />
  );
};

export default NonFollowersTab;
