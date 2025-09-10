'use client';

import type * as React from 'react';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { SessionProvider } from 'next-auth/react';
import { getQueryClient } from '@/app/get-query-client';
import { GlobalProgressIndicator } from '@/components/utils/progress';
import { ProgressProvider } from './progress';
import ModalManager from '@/components/modals/modalManager';

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ProgressProvider>
          {children}
          <GlobalProgressIndicator />
          <Toaster expand={true} />
          <ModalManager />
        </ProgressProvider>
        <ReactQueryDevtools />
      </QueryClientProvider>
    </SessionProvider>
  );
}
