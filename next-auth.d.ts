// https://github.com/nextauthjs/next-auth/discussions/536#discussioncomment-1932922
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    accessToken?: string;
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
