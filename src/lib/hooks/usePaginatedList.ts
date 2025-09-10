import { useCallback, useEffect, useMemo } from 'react';
import { usePaginationStore } from '../store/pagination';
import { useSettingsStore } from '../store/settings';

interface UsePaginatedListOptions<T> {
  listId: string;
  data: T[];
  itemsPerPage?: number;
  maxPagesToShow?: number;
}

interface UsePaginatedListReturn<T> {
  currentPageItems: T[];
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  displayedPageNumbers: (number | '...')[];
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
}

export const usePaginatedList = <T>({
  listId,
  data,
  itemsPerPage: itemsPerPageProp,
  maxPagesToShow = 5,
}: UsePaginatedListOptions<T>): UsePaginatedListReturn<T> => {
  const { pagination, setCurrentPage } = usePaginationStore();
  const { paginationPageSize } = useSettingsStore();
  const itemsPerPage = paginationPageSize ?? itemsPerPageProp;
  const currentPage = pagination[listId]?.currentPage ?? 1;

  const totalPages = Math.ceil(data.length / itemsPerPage);

  // Calculate items for the current page
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentPageItems = data.slice(indexOfFirstItem, indexOfLastItem);

  // Logic for displayed page numbers
  const displayedPageNumbers = useMemo(() => {
    const pages: (number | '...')[] = [];
    const ellipsisThreshold = 2;

    if (totalPages <= 1) return [];

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      let start = Math.max(2, currentPage - ellipsisThreshold);
      let end = Math.min(totalPages - 1, currentPage + ellipsisThreshold);

      if (currentPage - 1 < ellipsisThreshold) {
        end = maxPagesToShow - 2;
      }
      if (totalPages - currentPage < ellipsisThreshold + 1) {
        start = totalPages - maxPagesToShow + 3;
      }

      if (start > 2) {
        pages.push('...');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push('...');
      }

      if (totalPages > 1 && !pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }
    return pages;
  }, [currentPage, totalPages, maxPagesToShow]);

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(listId, page);
      } else if (page < 1) {
        setCurrentPage(listId, 1);
      } else {
        setCurrentPage(listId, totalPages);
      }
    },
    [totalPages, listId, setCurrentPage]
  );

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(listId, totalPages);
    } else if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(listId, 1);
    }
  }, [
    data.length,
    itemsPerPage,
    totalPages,
    currentPage,
    listId,
    setCurrentPage,
  ]);

  return {
    currentPageItems,
    currentPage,
    totalPages,
    itemsPerPage,
    displayedPageNumbers,
    goToPage,
    nextPage,
    prevPage,
  };
};
