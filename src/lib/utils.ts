import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { textSizes } from './types';
import {
  FollowerFieldsFragment,
  FollowingFieldsFragment,
  UserInfoFragment,
} from './gql/types';
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

export const getNonMutuals = (network: {
  followers: FollowerFieldsFragment['nodes'];
  following: FollowingFieldsFragment['nodes'];
}) => {
  const { followers, following } = network;
  const followerLogins = new Set(followers!.map((u) => u!.login));
  const followingLogins = new Set(following!.map((u) => u!.login));

  // Calculate non-mutuals using only logins
  const nonMutualsYouFollow = following!.filter(
    (u) => !followerLogins.has(u!.login)
  );

  const nonMutualsFollowingYou = followers!.filter(
    (u) => !followingLogins.has(u!.login)
  );

  const stats = {
    nonMutualsFollowingYou: nonMutualsFollowingYou as UserInfoFragment[],
    nonMutualsYouFollow: nonMutualsYouFollow as UserInfoFragment[],
  };

  return stats;
};

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
