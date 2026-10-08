import type { NetworkUser } from './types';

/** Logins kept per category, so a huge churn can't bloat the cache gist. */
export const MAX_DIFF_ENTRIES = 200;

/**
 * What changed between two syncs. Stored in the cache gist so the dashboard
 * can show "since your last sync" on any device until it's dismissed.
 */
export type NetworkDiff = {
  /** Timestamp of the snapshot being compared against. */
  since: number;
  /** When the newer sync ran. */
  at: number;
  newFollowers: string[];
  lostFollowers: string[];
  newFollowing: string[];
  removedFollowing: string[];
  /** Full counts (the login lists above are capped). */
  counts: {
    newFollowers: number;
    lostFollowers: number;
    newFollowing: number;
    removedFollowing: number;
  };
  dismissed?: boolean;
};

type Network = { followers: NetworkUser[]; following: NetworkUser[] };

const loginsOf = (users: NetworkUser[]) =>
  new Map(users.map((u) => [u.login.toLowerCase(), u.login]));

const added = (before: Map<string, string>, after: Map<string, string>) =>
  [...after.entries()]
    .filter(([key]) => !before.has(key))
    .map(([, login]) => login);

/** Pure diff of two network snapshots, by case-insensitive login. */
export const diffNetworks = (
  previous: Network,
  next: Network,
  { since, at }: { since: number; at: number }
): NetworkDiff => {
  const prevFollowers = loginsOf(previous.followers);
  const nextFollowers = loginsOf(next.followers);
  const prevFollowing = loginsOf(previous.following);
  const nextFollowing = loginsOf(next.following);

  const newFollowers = added(prevFollowers, nextFollowers);
  const lostFollowers = added(nextFollowers, prevFollowers);
  const newFollowing = added(prevFollowing, nextFollowing);
  const removedFollowing = added(nextFollowing, prevFollowing);

  return {
    since,
    at,
    newFollowers: newFollowers.slice(0, MAX_DIFF_ENTRIES),
    lostFollowers: lostFollowers.slice(0, MAX_DIFF_ENTRIES),
    newFollowing: newFollowing.slice(0, MAX_DIFF_ENTRIES),
    removedFollowing: removedFollowing.slice(0, MAX_DIFF_ENTRIES),
    counts: {
      newFollowers: newFollowers.length,
      lostFollowers: lostFollowers.length,
      newFollowing: newFollowing.length,
      removedFollowing: removedFollowing.length,
    },
  };
};

export const hasChanges = (diff: NetworkDiff | null | undefined) =>
  Boolean(diff) &&
  Object.values((diff as NetworkDiff).counts).some((count) => count > 0);
