import React from 'react';
import { Button } from '@/components/ui/button';

type TabHeaderProps =
  | {
      description: string;
      selectedCount: number;
      action: {
        label: string;
        onBulkAction: () => void;
        isBulkActionLoading: boolean;
      };
      selection: {
        onSelectAll: () => void;
        isAllSelected: boolean;
      };
    }
  | {
      description: string;
      selectedCount: undefined;
      action: undefined;
      selection: undefined;
    };

export const TabHeader = ({
  description,
  selectedCount,
  action,
  selection,
}: TabHeaderProps) => {
  const { label, onBulkAction, isBulkActionLoading } = action ?? {};
  const { onSelectAll, isAllSelected } = selection ?? {};
  const hasSelection = selectedCount ? selectedCount > 0 : false;

  return (
    <div className='my-2 space-y-3 md:mt-0'>
      <div className='flex w-full items-center justify-between'>
        <p className='text-sm text-muted-foreground'>{description}</p>
        {action && (
          <Button size='sm' variant='outline' onClick={onSelectAll}>
            {isAllSelected ? 'Unselect Page' : 'Select Page'}
          </Button>
        )}
      </div>
      {hasSelection && (
        <div className='flex items-center justify-end gap-4'>
          <span className='text-sm font-bold'>{selectedCount} selected</span>
          <Button
            size='sm'
            onClick={onBulkAction}
            disabled={isBulkActionLoading}
          >
            {isBulkActionLoading ? 'Processing...' : label}
          </Button>
        </div>
      )}
    </div>
  );
};
