import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import EmptyState from '@/components/ui/empty-state';
import { TabHeader } from './tabHeader';
import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useSelectionManager } from '@/lib/hooks/useSelectionManager';
import { useBulkOperation } from '@/lib/hooks/useBulkOperation';
import { UserInfoFragment } from '@/lib/gql/types';
import { LuHeart } from 'react-icons/lu';
import { TAB_DESCRIPTIONS } from '@/lib/constants';

const TAB_ID = 'following';

type FollowingTabProps = {
  following: UserInfoFragment[];
};

const FollowingTab = ({ following }: FollowingTabProps) => {
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
    following.map((u) => u!.login)
  );

  const { execute: bulkUnfollow, isPending: isBulkUnfollowing } =
    useBulkOperation(mutateAsync, 'Unfollowing', () => {
      persistChanges();
      clearSelection();
    });

  const handleBulkUnfollow = async () => {
    const usersToUnfollow = following.filter(
      (u) => u && selectedIds.has(u.login)
    );
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
      <PaginatedList
        listId={TAB_ID}
        data={following}
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
    </>
  );
};

export default FollowingTab;
