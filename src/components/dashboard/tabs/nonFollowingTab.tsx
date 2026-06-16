import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import EmptyState from '@/components/ui/empty-state';
import { TabHeader } from './tabHeader';
import ListControls from '@/components/utils/listControls';
import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useSelectionManager } from '@/lib/hooks/useSelectionManager';
import { useBulkOperation } from '@/lib/hooks/useBulkOperation';
import { useListControls } from '@/lib/hooks/useListControls';
import { NetworkUser } from '@/lib/types';
import { LuUserPlus } from 'react-icons/lu';
import { TAB_DESCRIPTIONS } from '@/lib/constants';
import { useCacheManager } from '@/lib/hooks/useCacheManager';

const TAB_ID = 'nonFollowing';

type NonFollowingTabProps = {
  oneWayIn: NetworkUser[];
};

const NonFollowingTab = ({ oneWayIn }: NonFollowingTabProps) => {
  const { followMutation, followNoPersist, incrementActionCount } =
    useFollowManager();
  const { isPending, mutate } = followMutation;
  const { persistChanges } = useCacheManager();
  const { search, setSearch, sort, setSort, processed } =
    useListControls(oneWayIn);

  const {
    selectedIds,
    handleSelect,
    clearSelection,
    handleDeselect,
    handleSelectPage,
    isAllSelected,
  } = useSelectionManager(
    TAB_ID,
    processed.map((u) => u.login)
  );

  const { execute: bulkFollow, isPending: isBulkFollowing } = useBulkOperation(
    (user) => followNoPersist(user),
    'Following',
    async () => {
      await persistChanges();
      clearSelection();
    }
  );

  const handleBulkFollow = async () => {
    const usersToFollow = processed.filter((u) => selectedIds.has(u.login));
    await bulkFollow(usersToFollow);
  };

  if (oneWayIn.length === 0) {
    return (
      <EmptyState
        icon={LuUserPlus}
        title='No One-Way In Connections'
        description="You are following everyone who follows you. That's great!"
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
          isAllSelected: isAllSelected,
        }}
        action={{
          label: 'Follow Selected',
          onBulkAction: handleBulkFollow,
          isBulkActionLoading: isBulkFollowing,
        }}
      />

      <ListControls
        search={search}
        setSearch={setSearch}
        sort={sort}
        setSort={setSort}
        data={processed}
        exportName='follow-sync-one-way-in'
      />

      <PaginatedList
        listId={TAB_ID}
        data={processed}
        getItemKey={(item) => item!.id || item!.login}
        renderItem={(item) => (
          <ConnectionCard
            user={item!}
            selection={{
              isSelected: selectedIds.has(item!.login),
              onSelect: handleSelect,
            }}
            action={{
              onClick: () =>
                mutate(
                  { user: item! },
                  {
                    onSuccess: () => {
                      if (selectedIds.has(item!.login)) {
                        handleDeselect(item!.login);
                      }
                      incrementActionCount();
                    },
                  }
                ),
              label: 'Follow',
              loading: isPending,
            }}
          />
        )}
      />
    </>
  );
};

export default NonFollowingTab;
