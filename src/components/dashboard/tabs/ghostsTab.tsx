import React, { useMemo } from 'react';
import { LuGhost } from 'react-icons/lu';
import ConnectionListTab, { ConnectionListAction } from './connectionListTab';
import { useGhostManager } from '@/lib/hooks/useGhostManager';
import { NetworkUser } from '@/lib/types';
import { TAB_DESCRIPTIONS } from '@/lib/constants';

type GhostsTabProps = {
  ghosts: NetworkUser[];
};

const GhostsTab = ({ ghosts }: GhostsTabProps) => {
  const { removeGhost, removeGhostSilently, removingLogins, persistChanges } =
    useGhostManager();

  const action = useMemo<ConnectionListAction>(
    () => ({
      label: 'Remove',
      verb: 'Remove',
      progressTitle: 'Removing Ghosts',
      destructive: true,
      run: removeGhost,
      runSilently: removeGhostSilently,
      persist: persistChanges,
      pendingLogins: removingLogins,
      // Only ghosts you follow can be removed; ghosts that merely follow you
      // are shown for awareness.
      canAct: (user) => Boolean(user.removable),
    }),
    [removeGhost, removeGhostSilently, persistChanges, removingLogins]
  );

  return (
    <ConnectionListTab
      listId='ghosts'
      description={TAB_DESCRIPTIONS.ghosts}
      exportName='follow-sync-ghosts'
      users={ghosts}
      action={action}
      includeGhosts
      empty={{
        icon: LuGhost,
        title: 'No Ghosts Found',
        description: 'No accounts are missing from your GitHub follow lists.',
      }}
    />
  );
};

export default GhostsTab;
