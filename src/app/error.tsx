'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center'>
      <h1 className='text-2xl font-bold'>Something went wrong</h1>
      <p className='max-w-md text-sm text-muted-foreground'>
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
