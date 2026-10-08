import React, { useMemo } from 'react';
import { LuUserPlus } from 'react-icons/lu';
import ConnectionListTab, { ConnectionListAction } from './connectionListTab';
import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useCacheManager } from '@/lib/hooks/useCacheManager';
import { NetworkUser } from '@/lib/types';
import { TAB_DESCRIPTIONS } from '@/lib/constants';

type NonFollowingTabProps = {
  oneWayIn: NetworkUser[];
};

const NonFollowingTab = ({ oneWayIn }: NonFollowingTabProps) => {
  const { follow, followNoPersist, pendingLogins } = useFollowManager();
  const { persistChanges } = useCacheManager();

  const action = useMemo<ConnectionListAction>(
    () => ({
      label: 'Follow',
      verb: 'Follow',
      progressTitle: 'Following',
      run: follow,
      runSilently: followNoPersist,
      persist: persistChanges,
      pendingLogins,
    }),
    [follow, followNoPersist, persistChanges, pendingLogins]
  );

  return (
    <ConnectionListTab
      listId='nonFollowing'
      description={TAB_DESCRIPTIONS.nonFollowing}
      exportName='follow-sync-one-way-in'
      users={oneWayIn}
      action={action}
      empty={{
        icon: LuUserPlus,
        title: 'No One-Way In Connections',
        description:
          "You are following everyone who follows you. That's great!",
      }}
    />
  );
};

export default NonFollowingTab;
