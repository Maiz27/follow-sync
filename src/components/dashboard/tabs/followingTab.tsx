import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { TabHeader } from './tabHeader';
import { UserInfoFragment } from '@/lib/gql/types';
import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useSelectionManager } from '@/lib/hooks/useSelectionManager';

type FollowingTabProps = {
  following: (UserInfoFragment | null)[];
};

const FollowingTab = ({ following }: FollowingTabProps) => {
  const { unfollowMutation } = useFollowManager();
  const { isPending, mutate } = unfollowMutation;

  const { selectedIds, handleSelect } = useSelectionManager(
    following.map((u) => u!.id)
  );

  const handleBulkUnfollow = () => {
    // TODO: Implement bulk unfollow logic
    console.log('Bulk unfollowing:', selectedIds);
  };

  return (
    <>
      <TabHeader
        selectedCount={selectedIds.size}
        action={{
          label: 'Unfollow Selected',
          onBulkAction: handleBulkUnfollow,
          isBulkActionLoading: false,
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
              onClick: () => mutate(item!),
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
