import React, { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type ListProps<T> = {
  data: T[];
  renderItem: (item: T) => React.ReactNode;
  getItemKey?: (item: T, index: number) => React.Key;
  gridClassName?: string;
  emptyMessage?: string;
  /** When set (a search is active), the empty state offers to clear it. */
  onClearSearch?: () => void;
};

const List = <T,>({
  data,
  renderItem,
  getItemKey,
  gridClassName,
  emptyMessage = 'No items to display.',
  onClearSearch,
}: ListProps<T>) => {
  if (!data || data.length === 0) {
    return (
      <div className='flex flex-col items-center gap-3 py-8 text-center text-muted-foreground'>
        <p>{emptyMessage}</p>
        {onClearSearch && (
          <Button size='sm' variant='outline' onClick={onClearSearch}>
            Clear search
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
        gridClassName
      )}
    >
      {data.map((item, index) => (
        <Fragment key={getItemKey ? getItemKey(item, index) : index}>
          {renderItem(item)}
        </Fragment>
      ))}
    </div>
  );
};

export default List;
