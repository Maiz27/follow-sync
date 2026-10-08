'use client';

import React, { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useProgress, ProgressItem } from '@/lib/context/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { Button } from '../ui/button';
import { LuX } from 'react-icons/lu';

type ProgressStatus = 'running' | 'complete' | 'error';

/** How many failed items to list before collapsing into "and N more". */
const MAX_DETAILS = 8;

const ProgressBar = ({ value, label }: { value: number; label: string }) => (
  <div
    role='progressbar'
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(value)}
    className='box-content h-2.5 w-full overflow-hidden rounded-full border border-border bg-muted-foreground'
  >
    <div
      className='h-2.5 rounded-full bg-accent transition-all duration-300 ease-in-out'
      style={{ width: `${value}%` }}
    />
  </div>
);

const ProgressToastContent = ({
  title,
  message,
  items,
  status,
  details,
  onCancel,
  onDismiss,
}: {
  title: string;
  message?: string;
  items: ProgressItem[];
  status: ProgressStatus;
  details?: string[];
  onCancel?: () => void;
  onDismiss: () => void;
}) => {
  const finalMessage =
    status === 'complete' ? message || 'Completed!' : message;
  const extraDetails = (details?.length ?? 0) - MAX_DETAILS;

  return (
    <Card className='w-full min-w-xs' aria-live='polite'>
      <CardHeader className='relative'>
        <CardTitle>{title}</CardTitle>
        {finalMessage && <CardDescription>{finalMessage}</CardDescription>}
        {status === 'error' && (
          <Button
            variant='ghost'
            size='icon'
            aria-label='Dismiss'
            className='absolute top-0 right-4 size-7'
            onClick={onDismiss}
          >
            <LuX />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {items.map((item) => {
            const cappedCurrent = item.isApproximateTotal
              ? Math.min(item.current, item.total)
              : item.current;
            const percentage =
              item.total > 0 ? (cappedCurrent / item.total) * 100 : 0;
            return (
              <div key={item.label}>
                <div className='mb-1 flex items-baseline justify-between text-xs'>
                  <span className='font-medium'>{item.label}</span>
                  <span className='text-primary'>
                    {item.current.toLocaleString()}
                    {item.isApproximateTotal ? '+' : ''} /{' '}
                    {item.total.toLocaleString()}
                  </span>
                </div>
                <ProgressBar value={percentage} label={item.label} />
              </div>
            );
          })}

          {status === 'error' && details && details.length > 0 && (
            <div className='text-xs'>
              <p className='mb-1 font-medium'>Failed:</p>
              <p className='text-muted-foreground'>
                {details
                  .slice(0, MAX_DETAILS)
                  .map((d) => `@${d}`)
                  .join(', ')}
                {extraDetails > 0 ? ` and ${extraDetails} more` : ''}
              </p>
            </div>
          )}

          {status === 'running' && onCancel && (
            <div className='flex justify-end'>
              <Button size='sm' variant='outline' onClick={onCancel}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * This component manages the toast lifecycle based on the ProgressContext state.
 * It does not render any UI itself, but rather controls the `sonner` toasts.
 */
export const GlobalProgressIndicator: React.FC = () => {
  const { state, hide } = useProgress();
  const { toastId, title, message, items, status, details, onCancel } = state;
  const previousToastId = useRef<string | number | null>(null);

  useEffect(() => {
    // A new operation replaces any earlier toast still on screen (e.g. an
    // undismissed failure).
    if (previousToastId.current && previousToastId.current !== toastId) {
      toast.dismiss(previousToastId.current);
    }
    previousToastId.current = toastId;
  }, [toastId]);

  useEffect(() => {
    if (toastId) {
      // When a toastId exists in the context, we show or update the toast.
      // `sonner` will create a new toast if the ID is new, or update
      // the existing one if the ID is the same.
      toast.custom(
        () => (
          <ProgressToastContent
            title={title}
            message={message}
            items={items}
            status={status}
            details={details}
            onCancel={onCancel}
            onDismiss={() => {
              toast.dismiss(toastId);
              hide();
            }}
          />
        ),
        {
          id: toastId,
          duration: Infinity, // Persist until manually dismissed
        }
      );
    }
  }, [toastId, title, message, items, status, details, onCancel, hide]);

  useEffect(() => {
    // Successful runs dismiss themselves; failures stay until the user closes
    // them, so the list of failed accounts can actually be read.
    if (status === 'complete' && toastId) {
      const timer = setTimeout(() => {
        toast.dismiss(toastId);
        hide(); // Reset the context state after dismissing.
      }, 2500);

      return () => clearTimeout(timer);
    }
  }, [status, toastId, hide]);

  return null; // This is a controller component, so it renders nothing.
};
