import React from 'react';
import { UserInfoFragment } from '@/lib/gql/types';

const FollowingTab = ({
  following,
}: {
  following: (UserInfoFragment | null)[];
}) => {
  return <div>FollowingTab</div>;
};

export default FollowingTab;
