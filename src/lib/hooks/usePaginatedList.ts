import { useCallback, useEffect, useMemo, useState } from 'react';

interface UsePaginatedListOptions<T> {
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
  data,
  itemsPerPage = 10,
  maxPagesToShow = 5,
}: UsePaginatedListOptions<T>): UsePaginatedListReturn<T> => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(data.length / itemsPerPage);

  // Calculate items for the current page
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentPageItems = data.slice(indexOfFirstItem, indexOfLastItem);

  // Logic for displayed page numbers
  const displayedPageNumbers = useMemo(() => {
    const pages: (number | '...')[] = [];
    const ellipsisThreshold = 2; // How many pages before/after current page to show ellipsis

    if (totalPages <= 1) return []; // No pagination needed

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always add the first page
      pages.push(1);

      // Determine the start and end of the numbers around the current page
      let start = Math.max(2, currentPage - ellipsisThreshold);
      let end = Math.min(totalPages - 1, currentPage + ellipsisThreshold);

      // Adjust start/end if they get too close to the beginning/end
      if (currentPage - 1 < ellipsisThreshold) {
        end = maxPagesToShow - 2; // Adjust end to fill up maxPagesToShow from start
      }
      if (totalPages - currentPage < ellipsisThreshold + 1) {
        start = totalPages - maxPagesToShow + 3; // Adjust start to fill up from end
      }

      // Add ellipsis if needed after the first page
      if (start > 2) {
        pages.push('...');
      }

      // Add pages around the current page
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      // Add ellipsis if needed before the last page
      if (end < totalPages - 1) {
        pages.push('...');
      }

      // Always add the last page (unless it's already included and totalPages > 1)
      if (totalPages > 1 && !pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }
    return pages;
  }, [currentPage, totalPages, maxPagesToShow]); // Dependencies for memoization
  // --- END Logic for displayed page numbers ---

  // Function to go to a specific page number
  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages) {
        setCurrentPage(page);
      } else if (page < 1) {
        setCurrentPage(1);
      } else {
        setCurrentPage(totalPages);
      }
    },
    [totalPages]
  );

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  // Reset page to 1 if data changes or items per page changes such that the current page is no longer valid
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    } else if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [data.length, itemsPerPage, totalPages, currentPage]);

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
