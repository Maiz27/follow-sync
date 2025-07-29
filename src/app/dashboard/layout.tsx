import { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import Providers from '../provider';

export default function Layout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <Providers>
      <SessionProvider>{children}</SessionProvider>
    </Providers>
  );
}
