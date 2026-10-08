import NextAuth, { Profile } from 'next-auth';
import GitHub from 'next-auth/providers/github';

const PROFILE_FIELDS = [
  'login',
  'company',
  'blog',
  'location',
  'bio',
  'twitter_username',
] as const;

const pickProfile = (profile: Profile | undefined): Profile =>
  Object.fromEntries(
    PROFILE_FIELDS.map((field) => [field, profile?.[field] ?? null])
  ) as Profile;

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      // GitHub returns an RFC 9207 `iss` parameter on the OAuth callback.
      // @auth/core validates it against the provider issuer, which defaults to
      // the `https://authjs.dev` placeholder on this pinned version and makes
      // every callback fail. Setting it explicitly matches what GitHub sends
      // (and what @auth/core >= 0.41.2 sets on its own).
      issuer: 'https://github.com/login/oauth',

      // `read:user` for profile reads, `user:follow` for follow/unfollow
      // mutations, and `gist` for the private-gist cache store. This is the
      // minimal set — the broad `user` scope additionally grants profile
      // *write* access, which the app never needs.
      authorization: {
        params: { scope: 'read:user user:follow gist' },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 24, // 1 day
    updateAge: 60 * 60 * 6, // 6 hours
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        // Keep only the profile fields the UI shows — the full GitHub profile
        // bloats the cookie (forcing chunking) and isn't needed.
        token.profile = pickProfile(profile);
      }
      return token;
    },
    async session({ session, token }) {
      const { login, company, blog, location, bio, twitter_username } =
        (token.profile ?? {}) as Profile;

      session.user = {
        ...session.user,
        login: (login as string | null) ?? undefined,
        company: (company as string | null) ?? undefined,
        blog: (blog as string | null) ?? undefined,
        location: (location as string | null) ?? undefined,
        bio: (bio as string | null) ?? undefined,
        twitter_username: (twitter_username as string | null) ?? undefined,
      };

      return session;
    },
  },
});
