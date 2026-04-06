import React from 'react';
import List from './list';
import PaginationControls from './paginationControls';
import { usePaginatedList } from '@/lib/hooks/usePaginatedList';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

interface PaginatedListProps<T> {
  listId: string;
  data: T[];
  renderItem: (item: T) => React.ReactNode;
  getItemKey?: (item: T, index: number) => React.Key;
  itemsPerPage?: number;
  maxPagesToShow?: number;
  gridClassName?: string;
  emptyMessage?: string;
  paginationControlsClassName?: string;
}

const PaginatedList = <T,>({
  listId,
  data,
  renderItem,
  getItemKey,
  itemsPerPage = DEFAULT_PAGE_SIZE,
  maxPagesToShow = 5,
  gridClassName,
  emptyMessage,
  paginationControlsClassName,
}: PaginatedListProps<T>) => {
  const {
    currentPageItems,
    currentPage,
    totalPages,
    goToPage,
    nextPage,
    prevPage,
    displayedPageNumbers,
  } = usePaginatedList({ listId, data, itemsPerPage, maxPagesToShow });

  return (
    <div className='flex flex-col'>
      <List
        data={currentPageItems}
        renderItem={renderItem}
        getItemKey={getItemKey}
        gridClassName={gridClassName}
        emptyMessage={emptyMessage}
      />
      <div className={paginationControlsClassName}>
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          displayedPageNumbers={displayedPageNumbers}
          goToPage={goToPage}
          nextPage={nextPage}
          prevPage={prevPage}
        />
      </div>
    </div>
  );
};

export default PaginatedList;
