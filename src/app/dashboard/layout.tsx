import { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import Providers from '@/lib/context/provider';
import { ProgressProvider } from '@/lib/context/progress';
import { Toaster } from '@/components/ui/sonner';
import { GlobalProgressIndicator } from '@/components/utils/progress';

export default function Layout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <Providers>
      <SessionProvider>
        <ProgressProvider>
          {children}
          <GlobalProgressIndicator />
          <Toaster />
        </ProgressProvider>
      </SessionProvider>
    </Providers>
  );
}
