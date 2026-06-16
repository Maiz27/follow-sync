// https://github.com/nextauthjs/next-auth/discussions/536#discussioncomment-1932922
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  // NOTE: the GitHub access token is intentionally NOT exposed on the session.
  // It stays in the encrypted (httpOnly) JWT and is read server-side only by
  // the API proxy routes, so it can never be exfiltrated from the browser.
  interface Session extends DefaultSession {
    user: {
      login?: string;
      company?: string;
      blog?: string;
      location?: string;
      bio?: string;
      twitter_username?: string;
    } & DefaultSession['user'];
  }
}
