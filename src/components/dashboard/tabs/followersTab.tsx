import React from 'react';
import PaginatedList from '@/components/utils/paginatedList';
import EmptyState from '@/components/ui/empty-state';
import ConnectionCard from '../connectionCard';
import ListControls from '@/components/utils/listControls';
import { NetworkUser } from '@/lib/types';
import { LuEye } from 'react-icons/lu';
import { TabHeader } from './tabHeader';
import { TAB_DESCRIPTIONS } from '@/lib/constants';
import { useListControls } from '@/lib/hooks/useListControls';

const TAB_ID = 'followers';

export type FollowersTabProps = {
  followers: NetworkUser[];
};

const FollowersTab = ({ followers }: FollowersTabProps) => {
  const { search, setSearch, sort, setSort, processed } =
    useListControls(followers);

  if (followers.length === 0) {
    return (
      <EmptyState
        icon={LuEye}
        title='No Followers'
        description="You don't have any followers yet. Keep engaging with the community!"
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
      <ListControls
        search={search}
        setSearch={setSearch}
        sort={sort}
        setSort={setSort}
        data={processed}
        exportName='follow-sync-followers'
      />
      <PaginatedList
        listId={TAB_ID}
        data={processed}
        getItemKey={(item) => item!.id || item!.login}
        renderItem={(item) => <ConnectionCard user={item!} />}
      />
    </>
  );
};

export default FollowersTab;

