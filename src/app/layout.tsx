import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/theme/themeProvider';
import Navbar from '@/components/nav/navbar';
import { Favicons } from '@/components/utils/Favicon';
import { getPageMetadata } from '@/lib/utils';
import './globals.css';

export const metadata: Metadata = getPageMetadata('home')!;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        <Favicons />
      </head>
      <body>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <Navbar />
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
