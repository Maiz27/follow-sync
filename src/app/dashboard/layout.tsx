import { ReactNode } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/app/auth';
import Providers from '@/lib/context/provider';
import { getPageMetadata } from '@/lib/utils';

export const metadata: Metadata = getPageMetadata('dashboard')!;

export default async function Layout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await auth();

  if (!session) {
    redirect('/');
  }

  return <Providers>{children}</Providers>;
}
