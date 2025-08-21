import { useState, useMemo } from 'react';

export const useSelectionManager = (itemIds: string[] = []) => {
  const [selectedIds, setSelectedIds] = useState(new Set<string>());

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

  const isAllSelected = useMemo(
    () => itemIds.length > 0 && selectedIds.size === itemIds.length,
    [selectedIds, itemIds]
  );

  return {
    selectedIds,
    handleSelect,
    handleDeselect,
    handleSelectAll,
    clearSelection,
    isAllSelected,
  };
};
