import React, { useMemo } from 'react';
import { LuUserX } from 'react-icons/lu';
import ConnectionListTab, { ConnectionListAction } from './connectionListTab';
import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useCacheManager } from '@/lib/hooks/useCacheManager';
import { NetworkUser } from '@/lib/types';
import { TAB_DESCRIPTIONS } from '@/lib/constants';

type NonFollowersTabProps = {
  oneWayOut: NetworkUser[];
};

const NonFollowersTab = ({ oneWayOut }: NonFollowersTabProps) => {
  const { unfollow, unfollowNoPersist, pendingLogins } = useFollowManager();
  const { persistChanges } = useCacheManager();

  const action = useMemo<ConnectionListAction>(
    () => ({
      label: 'Unfollow',
      verb: 'Unfollow',
      progressTitle: 'Unfollowing',
      run: unfollow,
      runSilently: unfollowNoPersist,
      persist: persistChanges,
      pendingLogins,
    }),
    [unfollow, unfollowNoPersist, persistChanges, pendingLogins]
  );

  return (
    <ConnectionListTab
      listId='nonFollowers'
      description={TAB_DESCRIPTIONS.nonFollowers}
      exportName='follow-sync-one-way-out'
      users={oneWayOut}
      action={action}
      ignorable
      hideIgnoredByDefault
      empty={{
        icon: LuUserX,
        title: 'No One-Way Out Connections',
        description: "Everyone you follow also follows you back. That's great!",
      }}
    />
  );
};

export default NonFollowersTab;
