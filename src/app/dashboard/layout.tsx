import { ReactNode } from 'react';
import Providers from '../provider';

export default function Layout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <Providers>{children}</Providers>;
}
