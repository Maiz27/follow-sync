import { auth } from '@/app/auth';

export default auth((req) => {
  // Allow access to the home page without authentication
  if (req.nextUrl.pathname === '/') return;

  // Redirect unauthenticated users to the home page
  if (!req.auth) {
    const newUrl = new URL('/', req.nextUrl.origin);
    return Response.redirect(newUrl);
  }
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
