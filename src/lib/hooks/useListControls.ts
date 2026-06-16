import { useMemo, useState } from 'react';
import { NetworkUser } from '@/lib/types';

export type SortOption = 'default' | 'followers' | 'following' | 'alphabetical';

/**
 * Client-side search + sort over a connection list. Filtering matches login or
 * display name (case-insensitive); sorting offers follower/following count and
 * alphabetical orderings on top of the API's default order.
 */
export const useListControls = (data: NetworkUser[]) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('default');

  const processed = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = query
      ? data.filter(
          (user) =>
            user.login.toLowerCase().includes(query) ||
            (user.name?.toLowerCase().includes(query) ?? false)
        )
      : data;

    if (sort === 'default') return filtered;

    return [...filtered].sort((a, b) => {
      if (sort === 'followers') {
        return b.followers.totalCount - a.followers.totalCount;
      }
      if (sort === 'following') {
        return b.following.totalCount - a.following.totalCount;
      }
      return (a.name || a.login).localeCompare(b.name || b.login);
    });
  }, [data, search, sort]);

  return { search, setSearch, sort, setSort, processed };
};
