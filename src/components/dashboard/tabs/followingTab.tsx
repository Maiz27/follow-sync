import React, { useMemo } from 'react';
import { LuHeart } from 'react-icons/lu';
import ConnectionListTab, { ConnectionListAction } from './connectionListTab';
import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useCacheManager } from '@/lib/hooks/useCacheManager';
import { NetworkUser } from '@/lib/types';
import { TAB_DESCRIPTIONS } from '@/lib/constants';

type FollowingTabProps = {
  following: NetworkUser[];
};

const FollowingTab = ({ following }: FollowingTabProps) => {
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
      listId='following'
      description={TAB_DESCRIPTIONS.following}
      exportName='follow-sync-following'
      users={following}
      action={action}
      ignorable
      empty={{
        icon: LuHeart,
        title: 'You are not following anyone yet',
        description: 'Start following other users to grow your network.',
      }}
    />
  );
};

export default FollowingTab;
