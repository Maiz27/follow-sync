import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import EmptyState from '@/components/ui/empty-state';
import { TabHeader } from './tabHeader';
import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useSelectionManager } from '@/lib/hooks/useSelectionManager';
import { useBulkOperation } from '@/lib/hooks/useBulkOperation';
import { UserInfoFragment } from '@/lib/gql/types';
import { LuUserX } from 'react-icons/lu';
import { TAB_DESCRIPTIONS } from '@/lib/constants';

const TAB_ID = 'nonFollowers';

type NonFollowersTabProps = {
  oneWayOut: UserInfoFragment[];
};

const NonFollowersTab = ({ oneWayOut }: NonFollowersTabProps) => {
  const { unfollowMutation, persistChanges, incrementActionCount } =
    useFollowManager();
  const { isPending, mutate, mutateAsync } = unfollowMutation;

  const {
    selectedIds,
    handleSelect,
    clearSelection,
    handleDeselect,
    handleSelectPage,
    isAllSelected,
  } = useSelectionManager(
    TAB_ID,
    oneWayOut.map((u) => u!.login)
  );

  const { execute: bulkUnfollow, isPending: isBulkUnfollowing } =
    useBulkOperation(mutateAsync, 'Unfollowing', () => {
      persistChanges();
      clearSelection();
    });

  const handleBulkUnfollow = async () => {
    const usersToUnfollow = oneWayOut.filter(
      (u) => u && selectedIds.has(u.login)
    ) as UserInfoFragment[];
    await bulkUnfollow(usersToUnfollow);
  };

  if (oneWayOut.length === 0) {
    return (
      <EmptyState
        icon={LuUserX}
        title='No One-Way Out Connections'
        description="Everyone you follow also follows you back. That's great!"
      />
    );
  }

  return (
    <div>
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
      <PaginatedList
        listId={TAB_ID}
        data={oneWayOut}
        renderItem={(item) => (
          <ConnectionCard
            user={item!}
            selection={{
              isSelected: selectedIds.has(item!.login),
              onSelect: handleSelect,
            }}
            action={{
              onClick: () =>
                mutate(item!, {
                  onSuccess: () => {
                    if (selectedIds.has(item!.login)) {
                      handleDeselect(item!.login);
                    }
                    persistChanges();
                    incrementActionCount();
                  },
                }),
              label: 'Unfollow',
              loading: isPending,
            }}
          />
        )}
      />
    </div>
  );
};

export default NonFollowersTab;
