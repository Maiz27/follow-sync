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

type FollowingTabProps = {
  following: UserInfoFragment[];
};

const FollowingTab = ({ following }: FollowingTabProps) => {
  const { unfollowMutation, persistChanges, incrementActionCount } =
    useFollowManager();
  const { isPending, mutate, mutateAsync } = unfollowMutation;

  const { selectedIds, handleSelect, clearSelection } = useSelectionManager(
    following.map((u) => u!.id)
  );
  const { execute: bulkUnfollow, isPending: isBulkUnfollowing } =
    useBulkOperation(mutateAsync, 'Unfollowing', () => {
      persistChanges();
      clearSelection();
    });

  const handleBulkUnfollow = async () => {
    const usersToUnfollow = following.filter((u) => u && selectedIds.has(u.id));
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
        selectedCount={selectedIds.size}
        action={{
          label: 'Unfollow Selected',
          onBulkAction: handleBulkUnfollow,
          isBulkActionLoading: isBulkUnfollowing,
        }}
      />
      <PaginatedList
        data={following}
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
