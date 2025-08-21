import React from 'react';
import EmptyState from '@/components/ui/empty-state';
import PaginatedList from '@/components/utils/paginatedList';
import ConnectionCard from '../connectionCard';
import { useCacheStore } from '@/lib/store/cache';
import { UserInfoFragment } from '@/lib/gql/types';
import { LuGhost } from 'react-icons/lu';
import { TabHeader } from './tabHeader';
import { TAB_DESCRIPTIONS } from '@/lib/constants';

const TAB_ID = 'ghosts';

type GhostsTabProps = {
  ghosts: UserInfoFragment[];
};

const GhostsTab = ({ ghosts }: GhostsTabProps) => {
  const { isCheckingGhosts } = useCacheStore();

  if (isCheckingGhosts) {
    return <div>Loading...</div>;
  }

  if (ghosts.length === 0) {
    return (
      <EmptyState
        icon={LuGhost}
        title='No Ghosts Found'
        description="We couldn't find any ghost users in your network. Good job!"
      />
    );
  }

  return (
    <>
      <TabHeader
        description={TAB_DESCRIPTIONS[TAB_ID]}
        selectedCount={undefined}
        action={undefined}
        selection={undefined}
      />
      <PaginatedList
        listId={TAB_ID}
        data={ghosts}
        renderItem={(item) => <ConnectionCard user={item!} />}
      />
    </>
  );
};

export default GhostsTab;
