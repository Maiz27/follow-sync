import { ReactNode } from 'react';
import { Metadata } from 'next';
import Providers from '@/lib/context/provider';
import { getPageMetadata } from '@/lib/utils';

export const metadata: Metadata = getPageMetadata('dashboard')!;

export default function Layout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <Providers>{children}</Providers>;
}
