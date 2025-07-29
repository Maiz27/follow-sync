import React from 'react';
import List from '@/components/utils/list';
import { UserInfoFragment } from '@/lib/gql/types';

export type FollowersTabProps = {
  followers: (UserInfoFragment | null)[];
};

const FollowersTab: React.FC<FollowersTabProps> = ({ followers }) => {
  console.log(followers);
  return <List data={followers} renderItem={(item) => <p>{item!.login}</p>} />;
};

export default FollowersTab;
