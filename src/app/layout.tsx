import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/theme/themeProvider';
import Navbar from '@/components/nav/navbar';
import { Favicons } from '@/components/utils/Favicon';
import ModalManager from '@/components/modals/modalManager';
import { getPageMetadata } from '@/lib/utils';
import './globals.css';

export const metadata: Metadata = getPageMetadata('home')!;
export const viewport: Viewport = {
  themeColor: { media: '(prefers-color-scheme: dark)', color: '#171717' },
};

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
          <ModalManager />
        </ThemeProvider>
      </body>
    </html>
  );
}
