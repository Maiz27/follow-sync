import React from 'react';
import { UserInfoFragment } from '@/lib/gql/types';

const NonFollowersTab = ({
  oneWayOut,
}: {
  oneWayOut: (UserInfoFragment | null)[];
}) => {
  return <div>NonFollowersTab</div>;
};

export default NonFollowersTab;
