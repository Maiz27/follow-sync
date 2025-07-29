import React, { Fragment } from 'react';
import { cn } from '@/lib/utils';

type ListProps<T> = {
  data: T[];
  renderItem: (item: T) => React.ReactNode;
  gridClassName?: string;
  emptyMessage?: string;
};

const List = <T,>({
  data,
  renderItem,
  gridClassName,
  emptyMessage = 'No items to display.',
}: ListProps<T>) => {
  if (!data || data.length === 0) {
    return <div className='py-8 text-center text-gray-500'>{emptyMessage}</div>;
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
        gridClassName
      )}
    >
      {data.map((item, index) => (
        <Fragment key={index}>{renderItem(item)}</Fragment>
      ))}
    </div>
  );
};

export default List;
