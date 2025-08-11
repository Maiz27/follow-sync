import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { TabHeader } from './tabHeader';
import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useSelectionManager } from '@/lib/hooks/useSelectionManager';
import { useBulkOperation } from '@/lib/hooks/useBulkOperation';
import { UserInfoFragment } from '@/lib/gql/types';

type NonFollowersTabProps = {
  oneWayOut: UserInfoFragment[];
};

const NonFollowersTab = ({ oneWayOut }: NonFollowersTabProps) => {
  const { unfollowMutation } = useFollowManager();
  const { isPending, mutate, mutateAsync } = unfollowMutation;

  const { selectedIds, handleSelect, clearSelection } = useSelectionManager(
    oneWayOut.map((u) => u!.id)
  );
  const { execute: bulkUnfollow, isPending: isBulkUnfollowing } =
    useBulkOperation(mutateAsync, 'Unfollowing');

  const handleBulkUnfollow = async () => {
    const usersToUnfollow = oneWayOut.filter(
      (u) => u && selectedIds.has(u.id)
    ) as UserInfoFragment[];
    await bulkUnfollow(usersToUnfollow);
    clearSelection();
  };

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
              onClick: () => mutate(item!),
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
