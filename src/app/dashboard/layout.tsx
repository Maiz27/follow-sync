import { ReactNode } from 'react';
import { Metadata } from 'next';
import { SessionProvider } from 'next-auth/react';
import { Toaster } from '@/components/ui/sonner';
import { GlobalProgressIndicator } from '@/components/utils/progress';
import Providers from '@/lib/context/provider';
import { ProgressProvider } from '@/lib/context/progress';
import { getPageMetadata } from '@/lib/utils';

export const metadata: Metadata = getPageMetadata('dashboard')!;

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
          <Toaster expand={true} />
        </ProgressProvider>
      </SessionProvider>
    </Providers>
  );
}
