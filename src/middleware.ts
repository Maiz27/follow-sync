import { auth } from '@/app/auth';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow access to public pages without authentication
  if (pathname === '/' || pathname === '/privacy' || pathname === '/terms') {
    return;
  }

  // Redirect unauthenticated users to the home page
  if (!req.auth) {
    const newUrl = new URL('/', req.nextUrl.origin);
    return Response.redirect(newUrl);
  }
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - API routes (`/api/`)
     * - Next.js internal files (`/_next/`)
     * - Static files in `public` (`/.*\\..*`) - this specifically excludes files with an extension
     */
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
  ],
};
