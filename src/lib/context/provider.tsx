'use client';

import type * as React from 'react';
import dynamic from 'next/dynamic';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/app/get-query-client';
import { GlobalProgressIndicator } from '@/components/utils/progress';
import { ProgressProvider } from './progress';
import ModalManager from '@/components/modals/modalManager';

const ReactQueryDevtools = dynamic(
  () =>
    import('@tanstack/react-query-devtools').then(
      (mod) => mod.ReactQueryDevtools
    ),
  { ssr: false }
);

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <QueryClientProvider client={queryClient}>
      <ProgressProvider>
        {children}
        <GlobalProgressIndicator />
        <Toaster expand={true} />
        <ModalManager />
      </ProgressProvider>
      {isDevelopment ? <ReactQueryDevtools /> : null}
    </QueryClientProvider>
  );
}
