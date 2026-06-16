import { useState, useMemo, useEffect } from 'react';
import { useGhostStore } from '@/lib/store/ghost';
import { usePaginationStore } from '@/lib/store/pagination';
import { useSettingsStore } from '@/lib/store/settings';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

type SelectionOptions = {
  /**
   * Whether ghosts are selectable on this list. Action tabs exclude them
   * (they can't be followed/unfollowed), but the Ghosts tab includes them
   * so they can be bulk-removed.
   */
  includeGhosts?: boolean;
};

export const useSelectionManager = (
  listId: string,
  itemIds: string[] = [],
  { includeGhosts = false }: SelectionOptions = {}
) => {
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const ghosts = useGhostStore((state) => state.ghostsSet);
  const { pagination } = usePaginationStore();
  // Must match the page size the list actually renders, otherwise "Select
  // Page" would select rows that aren't visible.
  const paginationPageSize = useSettingsStore(
    (state) => state.paginationPageSize
  );
  const pageSize = paginationPageSize ?? DEFAULT_PAGE_SIZE;
  const currentPage = pagination[listId]?.currentPage ?? 1;

  useEffect(() => {
    clearSelection();
  }, [currentPage]);

  // Drop selected ids that fall out of the list when it's searched/sorted, so
  // the selected count and bulk actions stay in sync with what's actually
  // shown. (next ⊆ prev, so equal sizes means nothing changed — return prev to
  // avoid a needless re-render.)
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(itemIds);
      const next = new Set<string>();
      prev.forEach((id) => {
        if (present.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [itemIds]);

  const pageItemIds = useMemo(() => {
    const indexOfLastItem = currentPage * pageSize;
    const indexOfFirstItem = indexOfLastItem - pageSize;
    return itemIds.slice(indexOfFirstItem, indexOfLastItem);
  }, [itemIds, currentPage, pageSize]);

  const selectablePageItemIds = useMemo(() => {
    if (includeGhosts) return pageItemIds;
    return pageItemIds.filter((id) => !ghosts.has(id));
  }, [pageItemIds, ghosts, includeGhosts]);

  const handleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleDeselect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  const handleSelectPage = () => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      const allPageItemsSelected = selectablePageItemIds.every((id) =>
        newSet.has(id)
      );

      if (allPageItemsSelected) {
        selectablePageItemIds.forEach((id) => newSet.delete(id));
      } else {
        selectablePageItemIds.forEach((id) => newSet.add(id));
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === itemIds.length) {
        return new Set<string>();
      } else {
        return new Set(itemIds);
      }
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set<string>());
  };

  const isAllSelected = useMemo(() => {
    return (
      selectablePageItemIds.length > 0 &&
      selectablePageItemIds.every((id) => selectedIds.has(id))
    );
  }, [selectedIds, selectablePageItemIds]);

  return {
    selectedIds,
    handleSelect,
    handleDeselect,
    handleSelectPage,
    handleSelectAll,
    clearSelection,
    isAllSelected,
  };
};
