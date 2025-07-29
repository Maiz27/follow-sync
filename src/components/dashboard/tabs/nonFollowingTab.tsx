import React from 'react';
import { UserInfoFragment } from '@/lib/gql/types';

const NonFollowingTab = ({
  oneWayIn,
}: {
  oneWayIn: (UserInfoFragment | null)[];
}) => {
  return <div>NonFollowingTab</div>;
};

export default NonFollowingTab;
