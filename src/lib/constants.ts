// Query Keys
export const QUERY_KEY_USER_NETWORK = 'user-network';

// GitHub Gist
export const GIST_DESCRIPTION = 'FollowSync Cache v1';
export const GIST_FILENAME = '[FOLLOW_SYNC] Network Cache.json';
export const GIST_ID_STORAGE_KEY = 'followSync_gist_id';

// Adaptive Stale Times (in milliseconds)
export const STALE_TIME_SMALL = 1000 * 60 * 10; // 10 minutes
export const STALE_TIME_MEDIUM = 1000 * 60 * 60; // 1 hour
export const STALE_TIME_LARGE = 1000 * 60 * 60 * 6; // 6 hours

// Metadata
export const DOMAIN = process.env.NEXT_PUBLIC_DOMAIN ?? 'localhost';

export const BASEURL = `https://${DOMAIN}`;

export const METADATA = new Map([
  [
    'home',
    {
      title: 'Follow Sync | GitHub Follower Management Tool',
      description:
        'The best way to manage your GitHub followers. Track, analyze, and grow your network effortlessly. Get insights into non-followers, fans, and more.',
      url: BASEURL,
      icon: '/imgs/logo/favicon.ico',
      image: `${BASEURL}/imgs/logo/og.png`,
      type: 'website',
    },
  ],
  [
    'dashboard',
    {
      title: 'Dashboard | Follow Sync',
      description:
        'Analyze your GitHub network. View your followers, following, non-followers, fans, and ghosts.',
      url: `${BASEURL}/dashboard`,
      icon: '/imgs/logo/favicon.ico',
      image: `${BASEURL}/imgs/logo/og.png`,
      type: 'website',
    },
  ],
]);
