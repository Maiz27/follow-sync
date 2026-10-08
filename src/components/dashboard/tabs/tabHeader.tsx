import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatNumber } from '@/lib/utils';

/** How many selected logins the confirmation dialog lists by name. */
const PREVIEW_COUNT = 5;

export type TabHeaderSelection = {
  selectedCount: number;
  /** Rows that can be selected across all pages (after search/filters). */
  selectableCount: number;
  isPageSelected: boolean;
  onSelectPage: () => void;
  onSelectAll: () => void;
};

export type TabHeaderBulkAction = {
  /** Button label, e.g. "Unfollow Selected". */
  label: string;
  /** Verb used in the confirmation, e.g. "Unfollow". */
  verb: string;
  selectedLogins: string[];
  onConfirm: () => void;
  isLoading: boolean;
  destructive?: boolean;
};

type TabHeaderProps = {
  description: string;
  selection?: TabHeaderSelection;
  action?: TabHeaderBulkAction;
};

export const TabHeader = ({
  description,
  selection,
  action,
}: TabHeaderProps) => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const selectedCount = selection?.selectedCount ?? 0;
  const hasSelection = selectedCount > 0;
  const isAllMatchingSelected =
    !!selection &&
    selection.selectableCount > 0 &&
    selectedCount === selection.selectableCount;

  const preview = action?.selectedLogins.slice(0, PREVIEW_COUNT) ?? [];
  const remaining = (action?.selectedLogins.length ?? 0) - preview.length;

  return (
    <div className='my-2 space-y-3 md:mt-0'>
      <div className='flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-sm text-muted-foreground'>{description}</p>
        {selection && action && (
          <div className='flex shrink-0 gap-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={selection.onSelectPage}
            >
              {selection.isPageSelected ? 'Unselect Page' : 'Select Page'}
            </Button>
            {selection.selectableCount > 0 && (
              <Button
                size='sm'
                variant='outline'
                onClick={selection.onSelectAll}
              >
                {isAllMatchingSelected
                  ? 'Unselect All'
                  : `Select All ${formatNumber(selection.selectableCount)}`}
              </Button>
            )}
          </div>
        )}
      </div>
      {hasSelection && action && (
        <div className='flex items-center justify-end gap-4'>
          <span className='text-sm font-bold'>{selectedCount} selected</span>
          <Button
            size='sm'
            variant={action.destructive ? 'destructive' : 'default'}
            onClick={() => setIsConfirmOpen(true)}
            disabled={action.isLoading}
          >
            {action.isLoading ? 'Processing...' : action.label}
          </Button>
        </div>
      )}

      {action && (
        <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {action.verb} {selectedCount}{' '}
                {selectedCount === 1 ? 'account' : 'accounts'}?
              </DialogTitle>
              <DialogDescription>
                This runs one at a time on GitHub and can take a while for large
                selections. You can cancel from the progress card.
              </DialogDescription>
            </DialogHeader>
            <p className='text-sm break-words'>
              {preview.map((login) => `@${login}`).join(', ')}
              {remaining > 0 ? ` and ${remaining} more` : ''}
            </p>
            <DialogFooter>
              <Button variant='outline' onClick={() => setIsConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant={action.destructive ? 'destructive' : 'default'}
                onClick={() => {
                  setIsConfirmOpen(false);
                  action.onConfirm();
                }}
              >
                {action.verb} {selectedCount}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
