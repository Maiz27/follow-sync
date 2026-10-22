import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { ThemeProvider } from '@/components/theme/themeProvider';
import { AuthSessionProvider } from '@/components/auth/sessionProvider';
import Navbar from '@/components/nav/navbar';
import Footer from '@/components/nav/footer';
import { Toaster } from '@/components/ui/sonner';
import { getPageMetadata } from '@/lib/utils';
import { SITE_NAME } from '@/lib/constants';
import './globals.css';

const homeMetadata = getPageMetadata('home')!;

export const metadata: Metadata = {
  ...homeMetadata,
  title: {
    default: 'Follow Sync | GitHub Follower Management Tool',
    template: `%s | ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  appleWebApp: { title: SITE_NAME },
  // Declared once here; `app/manifest.ts` owns the web manifest link.
  icons: {
    // The SVG is listed last so Chrome prefers it: it follows the colour
    // scheme and is drawn on a 16 grid, so it stays crisp in the tab.
    icon: [
      { url: '/imgs/logo/favicon.ico', sizes: '48x48' },
      { url: '/imgs/logo/icon-96.png', type: 'image/png', sizes: '96x96' },
      { url: '/imgs/logo/icon.svg', type: 'image/svg+xml' },
    ],
    apple: { url: '/imgs/logo/apple-icon.png', sizes: '180x180' },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#111111' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Set by middleware alongside the CSP. Reading it renders every page on
  // demand, which the nonce requires: a prerendered page can't carry one.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang='en' suppressHydrationWarning>
      <body>
        <ThemeProvider
          nonce={nonce}
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <AuthSessionProvider>
            <Navbar />
            <main>{children}</main>
            <Footer />
          </AuthSessionProvider>
          <Toaster expand={true} />
        </ThemeProvider>
      </body>
    </html>
  );
}
