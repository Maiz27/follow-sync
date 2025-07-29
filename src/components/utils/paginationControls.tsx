import React from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  displayedPageNumbers: (number | '...')[];
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
}

const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  displayedPageNumbers,
  goToPage,
  nextPage,
  prevPage,
}) => {
  if (totalPages <= 1) {
    return null; // Don't show controls if there's only one page or no data
  }

  return (
    <Pagination className='mt-8'>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={prevPage}
            aria-disabled={currentPage === 1}
            className={
              currentPage === 1 ? 'pointer-events-none opacity-50' : undefined
            }
          />
        </PaginationItem>

        {displayedPageNumbers.map(
          (
            page,
            index // Loop through the received pages
          ) => (
            <PaginationItem key={index}>
              {typeof page === 'number' ? (
                <PaginationLink
                  onClick={() => goToPage(page)}
                  isActive={page === currentPage}
                >
                  {page}
                </PaginationLink>
              ) : (
                <PaginationEllipsis />
              )}
            </PaginationItem>
          )
        )}

        <PaginationItem>
          <PaginationNext
            onClick={nextPage}
            aria-disabled={currentPage === totalPages}
            className={
              currentPage === totalPages
                ? 'pointer-events-none opacity-50'
                : undefined
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
};

export default PaginationControls;
