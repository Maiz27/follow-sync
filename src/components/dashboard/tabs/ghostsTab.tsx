import React from 'react';
import EmptyState from '@/components/ui/empty-state';
import PaginatedList from '@/components/utils/paginatedList';
import ConnectionCard from '../connectionCard';
import { NetworkUser } from '@/lib/types';
import { LuGhost } from 'react-icons/lu';
import { TabHeader } from './tabHeader';
import { TAB_DESCRIPTIONS } from '@/lib/constants';
import ListControls from '@/components/utils/listControls';
import { useGhostManager } from '@/lib/hooks/useGhostManager';
import { useSelectionManager } from '@/lib/hooks/useSelectionManager';
import { useBulkOperation } from '@/lib/hooks/useBulkOperation';
import { useListControls } from '@/lib/hooks/useListControls';

const TAB_ID = 'ghosts';

type GhostsTabProps = {
  ghosts: NetworkUser[];
};

const GhostsTab = ({ ghosts }: GhostsTabProps) => {
  const { removeGhost, removeGhostSilently, removingLogins, persistChanges } =
    useGhostManager();
  const { search, setSearch, sort, setSort, processed } =
    useListControls(ghosts);

  const {
    selectedIds,
    handleSelect,
    handleDeselect,
    handleSelectPage,
    clearSelection,
    isAllSelected,
  } = useSelectionManager(
    TAB_ID,
    // Only removable ghosts (ones you actually follow) are selectable; ghosts
    // that merely follow you can't be unfollowed.
    processed.filter((g) => g.removable).map((g) => g.login),
    { includeGhosts: true }
  );

  const { execute: bulkRemove, isPending: isBulkRemoving } = useBulkOperation(
    (user) => removeGhostSilently(user),
    'Removing Ghosts',
    async () => {
      await persistChanges();
      clearSelection();
    }
  );

  const handleBulkRemove = async () => {
    const ghostsToRemove = processed.filter((g) => selectedIds.has(g.login));
    await bulkRemove(ghostsToRemove);
  };

  if (ghosts.length === 0) {
    return (
      <EmptyState
        icon={LuGhost}
        title='No Ghosts Found'
        description="We couldn't find any deleted or suspended accounts in your network. Good job!"
      />
    );
  }

  return (
    <>
      <TabHeader
        description={TAB_DESCRIPTIONS[TAB_ID]}
        selectedCount={selectedIds.size}
        selection={{
          onSelectAll: handleSelectPage,
          isAllSelected,
        }}
        action={{
          label: 'Remove Selected',
          onBulkAction: handleBulkRemove,
          isBulkActionLoading: isBulkRemoving,
        }}
      />
      <ListControls
        search={search}
        setSearch={setSearch}
        sort={sort}
        setSort={setSort}
        data={processed}
        exportName='follow-sync-ghosts'
      />
      <PaginatedList
        listId={TAB_ID}
        data={processed}
        getItemKey={(item) => item!.id || item!.login}
        renderItem={(item) =>
          item!.removable ? (
            <ConnectionCard
              user={item!}
              selection={{
                isSelected: selectedIds.has(item!.login),
                onSelect: handleSelect,
              }}
              action={{
                label: 'Remove',
                loading: removingLogins.has(item!.login),
                onClick: async () => {
                  await removeGhost(item!);
                  if (selectedIds.has(item!.login)) {
                    handleDeselect(item!.login);
                  }
                },
              }}
            />
          ) : (
            // A ghost that only follows you — shown for awareness but can't be
            // removed (you don't follow it).
            <ConnectionCard user={item!} />
          )
        }
      />
    </>
  );
};

export default GhostsTab;
