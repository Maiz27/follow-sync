import React from 'react';
import List from './list';
import PaginationControls from './paginationControls';
import { usePaginatedList } from '@/lib/hooks/usePaginatedList';

interface PaginatedListProps<T> {
  data: T[];
  itemsPerPage?: number;
  maxPagesToShow?: number;
  renderItem: (item: T) => React.ReactNode;
  gridClassName?: string;
  emptyMessage?: string;
  paginationControlsClassName?: string;
}

const PaginatedList = <T,>({
  data,
  itemsPerPage = 50,
  maxPagesToShow = 5,
  renderItem,
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
  } = usePaginatedList({ data, itemsPerPage, maxPagesToShow });

  return (
    <div className='flex flex-col'>
      <List
        data={currentPageItems}
        renderItem={renderItem}
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
