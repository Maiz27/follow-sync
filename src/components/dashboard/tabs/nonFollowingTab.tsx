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
import { TAB_DESCRIPTIONS } from '@/lib/constants';

const TAB_ID = 'nonFollowing';

type NonFollowingTabProps = {
  oneWayIn: UserInfoFragment[];
};

const NonFollowingTab = ({ oneWayIn }: NonFollowingTabProps) => {
  const { followMutation, persistChanges, incrementActionCount } =
    useFollowManager();
  const { isPending, mutate, mutateAsync } = followMutation;

  const {
    selectedIds,
    handleSelect,
    clearSelection,
    handleDeselect,
    handleSelectPage,
    isAllSelected,
  } = useSelectionManager(
    TAB_ID,
    oneWayIn.map((u) => u!.login)
  );
  const { execute: bulkFollow, isPending: isBulkFollowing } = useBulkOperation(
    mutateAsync,
    'Following',
    () => {
      persistChanges();
      clearSelection();
    }
  );

  const handleBulkFollow = async () => {
    const usersToFollow = oneWayIn.filter((u) => u && selectedIds.has(u.id));
    await bulkFollow(usersToFollow);
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
        description={TAB_DESCRIPTIONS[TAB_ID]}
        selectedCount={selectedIds.size}
        selection={{
          onSelectAll: handleSelectPage,
          isAllSelected: isAllSelected,
        }}
        action={{
          label: 'Follow Selected',
          onBulkAction: handleBulkFollow,
          isBulkActionLoading: isBulkFollowing,
        }}
      />

      <PaginatedList
        listId={TAB_ID}
        data={oneWayIn}
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
