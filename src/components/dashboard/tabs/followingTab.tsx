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
import { LuHeart } from 'react-icons/lu';
import { TAB_DESCRIPTIONS } from '@/lib/constants';
import { useCacheManager } from '@/lib/hooks/useCacheManager';

const TAB_ID = 'following';

type FollowingTabProps = {
  following: NetworkUser[];
};

const FollowingTab = ({ following }: FollowingTabProps) => {
  const { unfollowMutation, incrementActionCount } = useFollowManager();
  const { isPending, mutate, mutateAsync } = unfollowMutation;
  const { persistChanges } = useCacheManager();
  const { search, setSearch, sort, setSort, processed } =
    useListControls(following);

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

  const { execute: bulkUnfollow, isPending: isBulkUnfollowing } =
    useBulkOperation(
      (user) => mutateAsync({ user, persist: false }),
      'Unfollowing',
      async () => {
        await persistChanges();
        clearSelection();
      }
    );

  const handleBulkUnfollow = async () => {
    const usersToUnfollow = processed.filter((u) => selectedIds.has(u.login));
    await bulkUnfollow(usersToUnfollow);
  };

  if (following.length === 0) {
    return (
      <EmptyState
        icon={LuHeart}
        title='You are not following anyone yet'
        description='Start following other users to grow your network.'
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
          label: 'Unfollow Selected',
          onBulkAction: handleBulkUnfollow,
          isBulkActionLoading: isBulkUnfollowing,
        }}
      />
      <ListControls
        search={search}
        setSearch={setSearch}
        sort={sort}
        setSort={setSort}
        data={processed}
        exportName='follow-sync-following'
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
                  { user: item!, persist: true },
                  {
                    onSuccess: () => {
                      if (selectedIds.has(item!.login)) {
                        handleDeselect(item!.login);
                      }
                      incrementActionCount();
                    },
                  }
                ),
              label: 'Unfollow',
              loading: isPending,
            }}
          />
        )}
      />
    </>
  );
};

export default FollowingTab;
