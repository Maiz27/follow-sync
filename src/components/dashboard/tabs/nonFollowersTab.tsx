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

type NonFollowersTabProps = {
  oneWayOut: UserInfoFragment[];
};

const NonFollowersTab = ({ oneWayOut }: NonFollowersTabProps) => {
  const { unfollowMutation, persistChanges, incrementActionCount } =
    useFollowManager();
  const { isPending, mutate, mutateAsync } = unfollowMutation;

  const { selectedIds, handleSelect, clearSelection, handleDeselect } = useSelectionManager(
    oneWayOut.map((u) => u!.id)
  );
  const { execute: bulkUnfollow, isPending: isBulkUnfollowing } =
    useBulkOperation(mutateAsync, 'Unfollowing', () => {
      persistChanges();
      clearSelection();
    });

  const handleBulkUnfollow = async () => {
    const usersToUnfollow = oneWayOut.filter(
      (u) => u && selectedIds.has(u.id)
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
        selectedCount={selectedIds.size}
        action={{
          label: 'Unfollow Selected',
          onBulkAction: handleBulkUnfollow,
          isBulkActionLoading: isBulkUnfollowing,
        }}
      />
      <PaginatedList
        data={oneWayOut}
        renderItem={(item) => (
          <ConnectionCard
            user={item!}
            selection={{
              isSelected: selectedIds.has(item!.id),
              onSelect: handleSelect,
            }}
            action={{
              onClick: () =>
                mutate(item!, {
                  onSuccess: () => {
                    if (selectedIds.has(item!.id)) {
                      handleDeselect(item!.id);
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
