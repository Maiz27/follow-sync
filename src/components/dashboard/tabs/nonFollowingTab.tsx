import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import EmptyState from '@/components/ui/empty-state';
import { TabHeader } from './tabHeader';
import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useSelectionManager } from '@/lib/hooks/useSelectionManager';
import { useBulkOperation } from '@/lib/hooks/useBulkOperation';
import { UserInfoFragment } from '@/lib/gql/types';
import { LuUserPlus } from 'react-icons/lu';

type NonFollowingTabProps = {
  oneWayIn: UserInfoFragment[];
};

const NonFollowingTab = ({ oneWayIn }: NonFollowingTabProps) => {
  const { followMutation } = useFollowManager();
  const { isPending, mutate, mutateAsync } = followMutation;

  const { selectedIds, handleSelect, clearSelection } = useSelectionManager(
    oneWayIn.map((u) => u!.id)
  );
  const { execute: bulkUnfollow, isPending: isBulkFollowing } =
    useBulkOperation(mutateAsync, 'Following');

  const handleBulkFollow = async () => {
    const usersToFollow = oneWayIn.filter((u) => u && selectedIds.has(u.id));
    await bulkUnfollow(usersToFollow);
    clearSelection();
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
        selectedCount={selectedIds.size}
        action={{
          label: 'Follow Selected',
          onBulkAction: handleBulkFollow,
          isBulkActionLoading: isBulkFollowing,
        }}
      />

      <PaginatedList
        data={oneWayIn}
        renderItem={(item) => (
          <ConnectionCard
            user={item!}
            selection={{
              isSelected: selectedIds.has(item!.id),
              onSelect: handleSelect,
            }}
            action={{
              onClick: () => mutate(item!),
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
