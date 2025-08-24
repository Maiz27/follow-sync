import { LuEye, LuHeart, LuUserX, LuUserPlus } from 'react-icons/lu';

// Query Keys
export const QUERY_KEY_USER_NETWORK = 'user-network';

// GitHub Gist
export const GIST_DESCRIPTION = 'FollowSync Cache v1';
export const GIST_FILENAME = '[FOLLOW_SYNC] Network Cache.json';
export const GIST_ID_STORAGE_KEY = 'followSync_gist_id';

// Adaptive Stale Times (in milliseconds)
export const STALE_TIME_SMALL = 1000 * 60 * 15; // 15 minutes
export const STALE_TIME_MEDIUM = 1000 * 60 * 60 * 3; // 3 hours
export const STALE_TIME_LARGE = 1000 * 60 * 60 * 12; // 12 hours
export const STALE_TIME_MANUAL_ONLY = Infinity; // Never stale, requires manual refresh

// Metadata
export const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN ?? 'localhost';
export const BASE_URL = `https://${DOMAIN}`;

export const GITHUB_REPO_URL = 'https://github.com/maiz27/follow-sync';

export const PAGE_COUNT = 100;

export const METADATA = new Map([
  [
    'home',
    {
      title: 'Follow Sync | GitHub Follower Management Tool',
      description:
        'The best way to manage your GitHub followers. Track, analyze, and grow your network effortlessly. Get insights into non-followers, fans, and more.',
      url: BASE_URL,
      icon: '/imgs/logo/favicon.ico',
      image: `${BASE_URL}/imgs/logo/og.png`,
      type: 'website',
    },
  ],
  [
    'dashboard',
    {
      title: 'Dashboard | Follow Sync',
      description:
        'Analyze your GitHub network. View your followers, following, non-followers, fans, and ghosts.',
      url: `${BASE_URL}/dashboard`,
      icon: '/imgs/logo/favicon.ico',
      image: `${BASE_URL}/imgs/logo/og.png`,
      type: 'website',
    },
  ],
]);

export const TAB_DESCRIPTIONS = {
  followers: 'Users currently following your GitHub profile.',
  following: 'Users you are currently following on GitHub.',
  nonFollowers: 'Users you follow who have not followed you back.',
  nonFollowing: 'Users who follow you, but you have not followed them back.',
  ghosts: 'Users who have deleted their GitHub profile.',
};

export const STATS_DATA = [
  {
    label: 'Your Audience (Followers)',
    icon: LuEye,
    description: 'Users currently following your GitHub profile.',
  },
  {
    label: 'Your Network (Following)',
    icon: LuHeart,
    description: 'Users you are currently following on GitHub.',
  },
  {
    label: 'One-Way Out (You Follow)',
    icon: LuUserX,
    description: 'Users you follow who have not followed you back.',
  },
  {
    label: 'One-Way In (They Follow)',
    icon: LuUserPlus,
    description: 'Users who follow you, but you have not followed them back.',
  },
];
