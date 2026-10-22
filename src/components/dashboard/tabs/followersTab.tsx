import React from 'react';
import { FollowersGlyph } from '@/components/brand/glyphs';
import ConnectionListTab from './connectionListTab';
import { NetworkUser } from '@/lib/types';
import { TAB_DESCRIPTIONS } from '@/lib/constants';

export type FollowersTabProps = {
  followers: NetworkUser[];
};

const FollowersTab = ({ followers }: FollowersTabProps) => (
  <ConnectionListTab
    listId='followers'
    description={TAB_DESCRIPTIONS.followers}
    exportName='follow-sync-followers'
    users={followers}
    ignorable
    empty={{
      icon: FollowersGlyph,
      title: 'No Followers',
      description:
        "You don't have any followers yet. Keep engaging with the community!",
    }}
  />
);

export default FollowersTab;
