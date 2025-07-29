import NextAuth, { Profile } from 'next-auth';
import GitHub from 'next-auth/providers/github';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [GitHub],

  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        token.profile = profile;
      }
      return token;
    },
    async session({ session, token }) {
      const { login, company, blog, location, bio, twitter_username } =
        token.profile as Profile;

      session.accessToken = token.accessToken as string | undefined;
      session.user = {
        ...session.user,
        login: login as string | undefined,
        company: company as string | undefined,
        blog: blog as string | undefined,
        location: location as string | undefined,
        bio: bio as string | undefined,
        twitter_username: twitter_username as string | undefined,
      };

      return session;
    },
  },
});
