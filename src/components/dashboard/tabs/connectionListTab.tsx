import React, { useCallback, useMemo } from 'react';
import { IconType } from 'react-icons';
import ConnectionCard from '../connectionCard';
import PaginatedList from '@/components/utils/paginatedList';
import EmptyState from '@/components/ui/empty-state';
import ListControls from '@/components/utils/listControls';
import { TabHeader } from './tabHeader';
import { useSelectionManager } from '@/lib/hooks/useSelectionManager';
import { useBulkOperation } from '@/lib/hooks/useBulkOperation';
import { useListControls } from '@/lib/hooks/useListControls';
import { NetworkUser } from '@/lib/types';

/**
 * What a list can do to its rows. Single actions persist on their own; bulk
 * actions run `runSilently` per row and `persist` once at the end.
 */
export type ConnectionListAction = {
  /** Card button label, e.g. "Unfollow". */
  label: string;
  /** Verb for the bulk button/confirmation, e.g. "Unfollow". */
  verb: string;
  /** Progress title for bulk runs, e.g. "Unfollowing". */
  progressTitle: string;
  destructive?: boolean;
  /** Single action; resolves to whether it succeeded. */
  run: (user: NetworkUser) => Promise<boolean>;
  runSilently: (user: NetworkUser) => Promise<unknown>;
  persist: () => Promise<void>;
  /** Logins with an action in flight, for per-card busy states. */
  pendingLogins: ReadonlySet<string>;
  /** Rows the action applies to; others render without button/checkbox. */
  canAct?: (user: NetworkUser) => boolean;
};

type ConnectionListTabProps = {
  listId: string;
  description: string;
  exportName: string;
  users: NetworkUser[];
  empty: { icon: IconType; title: string; description: string };
  action?: ConnectionListAction;
  /** Ghost rows are selectable (the Ghosts tab removes them). */
  includeGhosts?: boolean;
};

const isOrganization = (user: NetworkUser) =>
  user.accountType === 'organization';

/**
 * Shared body of every dashboard list: search/sort/export controls, paging,
 * selection, the confirmed bulk action and per-card actions.
 */
const ConnectionListTab = ({
  listId,
  description,
  exportName,
  users,
  empty,
  action,
  includeGhosts = false,
}: ConnectionListTabProps) => {
  const { search, setSearch, sort, setSort, processed, isSearching } =
    useListControls(users, { listId });

  const canAct = useCallback(
    (user: NetworkUser) =>
      Boolean(action) &&
      !isOrganization(user) &&
      (action?.canAct ? action.canAct(user) : true),
    [action]
  );

  const itemIds = useMemo(() => processed.map((u) => u.login), [processed]);
  // Listed (so pages line up with what's rendered) but never selectable.
  const unselectableIds = useMemo(
    () => new Set(processed.filter((u) => !canAct(u)).map((u) => u.login)),
    [processed, canAct]
  );

  const {
    selectedIds,
    handleSelect,
    handleDeselect,
    handleSelectPage,
    handleSelectAll,
    clearSelection,
    isAllSelected,
    selectableCount,
  } = useSelectionManager(listId, itemIds, { includeGhosts, unselectableIds });

  const noopBulk = useCallback(async () => undefined, []);
  const { execute: runBulk, isPending: isBulkRunning } = useBulkOperation(
    action?.runSilently ?? noopBulk,
    action?.progressTitle ?? '',
    async () => {
      await action?.persist();
      clearSelection();
    }
  );

  const selectedUsers = useMemo(
    () => processed.filter((u) => selectedIds.has(u.login)),
    [processed, selectedIds]
  );

  if (users.length === 0) {
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
      />
    );
  }

  return (
    <>
      <TabHeader
        description={description}
        selection={
          action
            ? {
                selectedCount: selectedIds.size,
                selectableCount,
                isPageSelected: isAllSelected,
                onSelectPage: handleSelectPage,
                onSelectAll: handleSelectAll,
              }
            : undefined
        }
        action={
          action
            ? {
                label: `${action.verb} Selected`,
                verb: action.verb,
                destructive: action.destructive,
                selectedLogins: selectedUsers.map((u) => u.login),
                onConfirm: () => runBulk(selectedUsers),
                isLoading: isBulkRunning,
              }
            : undefined
        }
      />
      <ListControls
        search={search}
        setSearch={setSearch}
        sort={sort}
        setSort={setSort}
        data={processed}
        exportName={exportName}
      />
      <PaginatedList
        listId={listId}
        data={processed}
        getItemKey={(item) => item.id || item.login}
        emptyMessage={
          isSearching ? `No connections match "${search.trim()}".` : undefined
        }
        onClearSearch={isSearching ? () => setSearch('') : undefined}
        renderItem={(item) =>
          action && canAct(item) ? (
            <ConnectionCard
              user={item}
              selection={{
                isSelected: selectedIds.has(item.login),
                onSelect: handleSelect,
              }}
              action={{
                label: action.label,
                loading: action.pendingLogins.has(item.login),
                onClick: async () => {
                  const succeeded = await action.run(item);
                  if (succeeded && selectedIds.has(item.login)) {
                    handleDeselect(item.login);
                  }
                },
              }}
            />
          ) : (
            <ConnectionCard user={item} />
          )
        }
      />
    </>
  );
};

export default ConnectionListTab;
