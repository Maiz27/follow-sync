import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { NetworkUser, textSizes } from './types';
import type { RestFollowingEntry } from './gql/fetchers';
import { Metadata } from 'next';
import { OpenGraph } from 'next/dist/lib/metadata/types/opengraph-types';
import { BASE_URL, METADATA } from './constants';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number, decimals: number = 1): string {
  // If the number is less than 1000, return it as is (no abbreviation, no '+')
  if (num < 1000) {
    return num.toString();
  }

  const si = [
    { value: 1e3, symbol: 'K' }, // Thousands
    { value: 1e6, symbol: 'M' }, // Millions
    { value: 1e9, symbol: 'B' }, // Billions
    { value: 1e12, symbol: 'T' }, // Trillions
    // Add more if you expect even larger numbers
  ];

  // Find the appropriate suffix for the number
  let i;
  for (i = si.length - 1; i > 0; i--) {
    if (num >= si[i].value) {
      break;
    }
  }

  // Calculate the formatted value and apply symbol
  // Regex to remove trailing zeros and redundant decimal points (e.g., "1.0K" -> "1K")
  const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  const formattedValue = (num / si[i].value)
    .toFixed(decimals)
    .replace(rx, '$1');

  // Add the '+' suffix
  const suffix = '+';

  return formattedValue + si[i].symbol + suffix;
}
export const timeAgo = (timestamp: number) => {
  const now = Date.now();
  const secondsAgo = Math.floor((now - timestamp) / 1000);

  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'week', seconds: 604800 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
    { label: 'second', seconds: 1 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(secondsAgo / interval.seconds);
    if (count > 0) {
      return `${count} ${interval.label}${count !== 1 ? 's' : ''} ago`;
    }
  }

  return 'just now';
};

export const textSizesClasses: Record<NonNullable<textSizes>, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
  '5xl': 'text-5xl',
  '6xl': 'text-6xl',
  '7xl': 'text-7xl',
};

/**
 * Non-mutual connections are only meaningful between real user accounts.
 * Organizations cannot follow you back, and ghosts (deleted/suspended
 * accounts) are surfaced separately, so both are excluded from the
 * follow-back analysis.
 */
const isActionableUser = (user: NetworkUser) =>
  user.accountType !== 'organization' && user.accountType !== 'ghost';

const restEntryToNetworkUser = (entry: RestFollowingEntry): NetworkUser => ({
  __typename: 'User',
  id: entry.nodeId,
  login: entry.login,
  name: null,
  avatarUrl: entry.avatarUrl,
  url: entry.htmlUrl,
  followers: { totalCount: 0 },
  following: { totalCount: 0 },
  accountType: entry.type === 'Organization' ? 'organization' : 'user',
});

/**
 * Reconciles the GraphQL following list against the REST following list to
 * classify every followed account. The two GitHub APIs are mirror images:
 *
 * - GraphQL `following` returns active users AND ghosts, but omits organizations.
 * - REST `/user/following` returns active users AND organizations, but omits ghosts.
 *
 * So: a login in GraphQL but absent from REST is a ghost (deleted/suspended),
 * and any REST entry typed `Organization` is an org that GraphQL hid from us.
 */
export const classifyFollowing = ({
  graphqlFollowing,
  restFollowing,
}: {
  graphqlFollowing: NetworkUser[];
  restFollowing: RestFollowingEntry[];
}): { following: NetworkUser[]; ghosts: NetworkUser[] } => {
  const restByLogin = new Map(
    restFollowing.map((entry) => [entry.login.toLowerCase(), entry])
  );

  const following: NetworkUser[] = [];
  const ghosts: NetworkUser[] = [];

  for (const user of graphqlFollowing) {
    const restEntry = restByLogin.get(user.login.toLowerCase());
    if (!restEntry) {
      // In your following list but gone from REST => removable ghost.
      ghosts.push({ ...user, accountType: 'ghost', removable: true });
    } else if (restEntry.type === 'Organization') {
      following.push({ ...user, accountType: 'organization' });
    } else {
      following.push({ ...user, accountType: 'user' });
    }
  }

  // Organizations are never returned by GraphQL, so add them from REST.
  const graphqlLogins = new Set(
    graphqlFollowing.map((u) => u.login.toLowerCase())
  );
  for (const entry of restFollowing) {
    if (entry.type !== 'Organization') continue;
    if (graphqlLogins.has(entry.login.toLowerCase())) continue;
    following.push(restEntryToNetworkUser(entry));
  }

  return { following, ghosts };
};

/**
 * Detects ghosts among followers: accounts GraphQL still lists as following you
 * but that are absent from the REST followers list (deleted/suspended). These
 * ghosts are NOT removable — you can't unfollow someone who follows you.
 */
export const classifyFollowers = ({
  graphqlFollowers,
  restFollowers,
}: {
  graphqlFollowers: NetworkUser[];
  restFollowers: RestFollowingEntry[];
}): { followers: NetworkUser[]; ghosts: NetworkUser[] } => {
  const restLogins = new Set(
    restFollowers.map((entry) => entry.login.toLowerCase())
  );

  const followers: NetworkUser[] = [];
  const ghosts: NetworkUser[] = [];

  for (const user of graphqlFollowers) {
    if (restLogins.has(user.login.toLowerCase())) {
      followers.push({ ...user, accountType: 'user' });
    } else {
      ghosts.push({ ...user, accountType: 'ghost', removable: false });
    }
  }

  return { followers, ghosts };
};

/**
 * Merges following-side and follower-side ghosts, de-duplicated by login. A
 * ghost present on both sides is removable (since you follow it).
 */
export const mergeGhosts = (
  followingGhosts: NetworkUser[],
  followerGhosts: NetworkUser[]
): NetworkUser[] => {
  const byLogin = new Map<string, NetworkUser>();
  for (const ghost of [...followingGhosts, ...followerGhosts]) {
    const key = ghost.login.toLowerCase();
    const existing = byLogin.get(key);
    if (!existing) {
      byLogin.set(key, ghost);
    } else if (ghost.removable && !existing.removable) {
      byLogin.set(key, ghost);
    }
  }
  return Array.from(byLogin.values());
};

export const getNonMutuals = (network: {
  followers: NetworkUser[];
  following: NetworkUser[];
}) => {
  const { followers, following } = network;
  const followerLogins = new Set(followers.map((u) => u.login));
  const followingLogins = new Set(following.map((u) => u.login));

  const nonMutualsYouFollow = following.filter(
    (u) => isActionableUser(u) && !followerLogins.has(u.login)
  );

  const nonMutualsFollowingYou = followers.filter(
    (u) => isActionableUser(u) && !followingLogins.has(u.login)
  );

  return {
    nonMutualsFollowingYou,
    nonMutualsYouFollow,
  };
};

const csvEscape = (value: string | number): string => {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/** Serializes a list of connections to CSV for export. */
export const usersToCSV = (users: NetworkUser[]): string => {
  const header = [
    'login',
    'name',
    'url',
    'followers',
    'following',
    'accountType',
  ];
  const rows = users.map((u) => [
    u.login,
    u.name ?? '',
    `https://github.com/${u.login}`,
    u.followers.totalCount,
    u.following.totalCount,
    u.accountType ?? 'user',
  ]);
  return [header, ...rows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\n');
};

/** Serializes a list of connections to pretty JSON for export. */
export const usersToJSON = (users: NetworkUser[]): string =>
  JSON.stringify(
    users.map((u) => ({
      login: u.login,
      name: u.name ?? null,
      url: `https://github.com/${u.login}`,
      followers: u.followers.totalCount,
      following: u.following.totalCount,
      accountType: u.accountType ?? 'user',
    })),
    null,
    2
  );

export const getPageMetadata = (name: string): Metadata | undefined => {
  const pageMetaData = METADATA.get(name);

  if (pageMetaData)
    return {
      metadataBase: new URL(BASE_URL),
      title: pageMetaData.title,
      description: pageMetaData.description,
      alternates: {
        canonical: pageMetaData.url,
      },
      icons: {
        icon: pageMetaData.icon,
        shortcut: pageMetaData.icon,
        apple: '/imgs/logo/apple-icon.png',
        other: {
          rel: 'apple-touch-icon-precomposed',
          url: pageMetaData.icon,
        },
      },
      openGraph: {
        type: pageMetaData.type,
        url: pageMetaData.url,
        title: pageMetaData.title,
        description: pageMetaData.description,
        siteName: pageMetaData.title,
        images: [
          {
            url: pageMetaData.image,
          },
        ],
      } as OpenGraph,
      twitter: {
        card: 'summary_large_image',
        site: pageMetaData.url,
        images: [
          {
            url: pageMetaData.image,
          },
        ],
      },
      robots: {
        index: true,
        follow: true,
        'max-snippet': 50,
        'max-image-preview': 'large',
        'max-video-preview': -1,
      },
    };
};
