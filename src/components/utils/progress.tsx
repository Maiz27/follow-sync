'use client';

import React, { useEffect } from 'react';
import { toast } from 'sonner';
import { useProgress, ProgressItem } from '@/lib/context/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';

type ProgressStatus = 'running' | 'complete' | 'error';

const ProgressBar = ({ value }: { value: number }) => (
  <div className='box-content h-2.5 w-full overflow-hidden rounded-full border border-border bg-muted-foreground'>
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
}: {
  title: string;
  message?: string;
  items: ProgressItem[];
  status: ProgressStatus;
}) => {
  const finalMessage =
    status === 'complete'
      ? 'Completed!'
      : status === 'error'
        ? message
        : message;

  return (
    <Card className='w-full min-w-xs'>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {finalMessage && <CardDescription>{finalMessage}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {items.map((item) => {
            const percentage =
              item.total > 0 ? (item.current / item.total) * 100 : 0;
            return (
              <div key={item.label}>
                <div className='mb-1 flex items-baseline justify-between text-xs'>
                  <span className='font-medium'>{item.label}</span>
                  <span className='text-primary'>
                    {item.current.toLocaleString()} /{' '}
                    {item.total.toLocaleString()}
                  </span>
                </div>
                <ProgressBar value={percentage} />
              </div>
            );
          })}
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
  const { toastId, title, message, items, status } = state;

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
          />
        ),
        {
          id: toastId,
          duration: Infinity, // Persist until manually dismissed
        }
      );
    }
  }, [toastId, title, message, items, status]);

  useEffect(() => {
    // This effect is dedicated to handling dismissal.
    // It triggers when the status changes to a terminal state.
    if ((status === 'complete' || status === 'error') && toastId) {
      const timer = setTimeout(() => {
        toast.dismiss(toastId);
        hide(); // Reset the context state after dismissing.
      }, 1500); // Wait 1.5s to allow the user to see the final state.

      return () => clearTimeout(timer); // Cleanup on unmount.
    }
  }, [status, toastId, hide]);

  return null; // This is a controller component, so it renders nothing.
};
