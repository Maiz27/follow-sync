import { useState, useMemo, useEffect } from 'react';
import { useCacheStore } from '@/lib/store/cache';
import { usePaginationStore } from '@/lib/store/pagination';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

export const useSelectionManager = (listId: string, itemIds: string[] = []) => {
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const ghosts = useCacheStore((state) => state.ghostsSet);
  const { pagination } = usePaginationStore();
  const currentPage = pagination[listId]?.currentPage ?? 1;

  useEffect(() => {
    clearSelection();
  }, [currentPage]);

  const pageItemIds = useMemo(() => {
    const indexOfLastItem = currentPage * DEFAULT_PAGE_SIZE;
    const indexOfFirstItem = indexOfLastItem - DEFAULT_PAGE_SIZE;
    return itemIds.slice(indexOfFirstItem, indexOfLastItem);
  }, [itemIds, currentPage]);

  const nonGhostPageItemIds = useMemo(() => {
    return pageItemIds.filter((id) => !ghosts.has(id));
  }, [pageItemIds, ghosts]);

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
      const allPageItemsSelected = nonGhostPageItemIds.every((id) =>
        newSet.has(id)
      );

      if (allPageItemsSelected) {
        nonGhostPageItemIds.forEach((id) => newSet.delete(id));
      } else {
        nonGhostPageItemIds.forEach((id) => newSet.add(id));
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
      nonGhostPageItemIds.length > 0 &&
      nonGhostPageItemIds.every((id) => selectedIds.has(id))
    );
  }, [selectedIds, nonGhostPageItemIds]);

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
