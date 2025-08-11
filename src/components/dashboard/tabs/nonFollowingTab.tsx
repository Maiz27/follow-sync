import React from 'react';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import { TabHeader } from './tabHeader';
import { UserInfoFragment } from '@/lib/gql/types';
import { useFollowManager } from '@/lib/hooks/useFollowManager';
import { useSelectionManager } from '@/lib/hooks/useSelectionManager';

type NonFollowingTabProps = {
  oneWayIn: (UserInfoFragment | null)[];
};

const NonFollowingTab = ({ oneWayIn }: NonFollowingTabProps) => {
  const { followMutation } = useFollowManager();
  const { isPending, mutate } = followMutation;

  const { selectedIds, handleSelect } = useSelectionManager(
    oneWayIn.map((u) => u!.id)
  );

  const handleBulkFollow = () => {
    // TODO: Implement bulk unfollow logic
    console.log('Bulk unfollowing:', selectedIds);
  };

  return (
    <>
      <TabHeader
        selectedCount={selectedIds.size}
        action={{
          label: 'follow Selected',
          onBulkAction: handleBulkFollow,
          isBulkActionLoading: false,
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
