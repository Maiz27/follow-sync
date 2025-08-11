import React from 'react';
import { Button } from '@/components/ui/button';

interface TabHeaderProps {
  selectedCount: number;
  action: {
    label: string;
    onBulkAction: () => void;
    isBulkActionLoading: boolean;
  };
}

export const TabHeader = ({
  selectedCount,
  action: { label, onBulkAction, isBulkActionLoading },
}: TabHeaderProps) => {
  const hasSelection = selectedCount > 0;

  if (hasSelection)
    return (
      <div className='mb-2 flex items-center justify-between gap-4'>
        <span className='font-bold'>{selectedCount} selected</span>
        <Button size='sm' onClick={onBulkAction} disabled={isBulkActionLoading}>
          {isBulkActionLoading ? 'Processing...' : label}
        </Button>
      </div>
    );
};
