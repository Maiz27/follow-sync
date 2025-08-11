import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { UserInfoFragment } from '@/lib/gql/types';
import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useSelectionManager } from '@/lib/hooks/useSelectionManager';
import { TabHeader } from './tabHeader';

type NonFollowersTabProps = {
  oneWayOut: (UserInfoFragment | null)[];
};

const NonFollowersTab = ({ oneWayOut }: NonFollowersTabProps) => {
  const { unfollowMutation } = useFollowManager();
  const { isPending, mutate } = unfollowMutation;
  const { selectedIds, handleSelect } = useSelectionManager(
    oneWayOut.map((u) => u!.id)
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
    </>
  );
};

export default NonFollowersTab;
