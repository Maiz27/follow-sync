import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { textSizes } from './types';
import { FollowerFieldsFragment, FollowingFieldsFragment } from './gql/types';

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

export const getNonMutuals = ({
  followers,
  following,
}: {
  followers: Pick<FollowerFieldsFragment, 'nodes' | 'totalCount'>;
  following: Pick<FollowingFieldsFragment, 'nodes' | 'totalCount'>;
}) => {
  const followerLogins = new Set(followers.nodes!.map((u) => u!.login));
  const followingLogins = new Set(following.nodes!.map((u) => u!.login));

  // Calculate non-mutuals using only logins
  const nonMutualsFollowingYou = following.nodes!.filter(
    (u) => !followerLogins.has(u!.login)
  );

  const nonMutualsYouFollow = followers.nodes!.filter(
    (u) => !followingLogins.has(u!.login)
  );

  const stats = {
    nonMutualsFollowingYou: nonMutualsFollowingYou.length,
    nonMutualsYouFollow: nonMutualsYouFollow.length,
  };

  return stats;
};
