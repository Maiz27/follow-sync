import type { AccountType, CachedData, NetworkUser } from './types';

/**
 * Compact on-disk format for the cache gist.
 *
 * The Gist API inlines file content only up to 1 MB (larger files come back
 * `truncated`), and the original object-per-user JSON cost ~310 bytes per
 * connection — so caches broke at roughly 3,400 connections. Users are stored
 * as positional tuples without derivable fields (profile URL, `__typename`,
 * the avatar host), which is ~3-4x smaller. Old caches (plain `CachedData`)
 * still parse: `decodeCache` passes them through unchanged.
 */
export const COMPACT_CACHE_FORMAT = 'compact-1';

const AVATAR_PREFIX = 'https://avatars.githubusercontent.com/';

/**
 * [id, login, name, avatar, followers, following, accountType, removable]
 * `avatar` drops the shared host prefix; `accountType` is 0 (user/unknown),
 * 1 (organization) or 2 (ghost); `removable` is 1 for removable ghosts.
 */
export type CompactUser = [
  string,
  string,
  string | null,
  string,
  number,
  number,
  0 | 1 | 2,
  0 | 1,
];

const ACCOUNT_TYPES: Array<AccountType | undefined> = [
  'user',
  'organization',
  'ghost',
];

export type CompactCache = Omit<CachedData, 'network' | 'ghosts'> & {
  format: typeof COMPACT_CACHE_FORMAT;
  network: { followers: CompactUser[]; following: CompactUser[] };
  ghosts: CompactUser[];
};

export const encodeUser = (user: NetworkUser): CompactUser => {
  const avatar = String(user.avatarUrl ?? '');
  return [
    user.id,
    user.login,
    user.name ?? null,
    avatar.startsWith(AVATAR_PREFIX)
      ? avatar.slice(AVATAR_PREFIX.length)
      : avatar,
    user.followers?.totalCount ?? 0,
    user.following?.totalCount ?? 0,
    user.accountType === 'organization'
      ? 1
      : user.accountType === 'ghost'
        ? 2
        : 0,
    user.removable ? 1 : 0,
  ];
};

export const decodeUser = ([
  id,
  login,
  name,
  avatar,
  followers,
  following,
  type,
  removable,
]: CompactUser): NetworkUser => {
  const user: NetworkUser = {
    __typename: 'User',
    id,
    login,
    name,
    avatarUrl:
      avatar && !/^https?:\/\//.test(avatar) ? AVATAR_PREFIX + avatar : avatar,
    url: `https://github.com/${login}`,
    followers: { totalCount: followers },
    following: { totalCount: following },
    accountType: ACCOUNT_TYPES[type] ?? 'user',
  };
  if (removable) user.removable = true;
  else if (type === 2) user.removable = false;
  return user;
};

export const encodeCache = (data: CachedData): CompactCache => ({
  ...data,
  format: COMPACT_CACHE_FORMAT,
  network: {
    followers: data.network.followers.map(encodeUser),
    following: data.network.following.map(encodeUser),
  },
  ghosts: data.ghosts.map(encodeUser),
});

const isCompactCache = (value: unknown): value is CompactCache =>
  typeof value === 'object' &&
  value !== null &&
  (value as { format?: unknown }).format === COMPACT_CACHE_FORMAT;

/** Accepts either the compact or the legacy object format. */
export const decodeCache = (value: unknown): CachedData => {
  if (!isCompactCache(value)) return value as CachedData;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { format, network, ghosts, ...rest } = value;
  return {
    ...rest,
    network: {
      followers: network.followers.map(decodeUser),
      following: network.following.map(decodeUser),
    },
    ghosts: ghosts.map(decodeUser),
  };
};
