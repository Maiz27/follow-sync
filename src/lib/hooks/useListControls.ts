import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { NetworkUser } from '@/lib/types';
import { usePaginationStore } from '@/lib/store/pagination';

export type SortOption = 'default' | 'followers' | 'following' | 'alphabetical';

type SearchEntry = { user: NetworkUser; haystack: string };

/**
 * Pure search + sort over a connection list (exported for tests). Search
 * matches login or display name, case-insensitively, against a pre-lowercased
 * index so typing doesn't re-lowercase every name on each keystroke.
 */
export const filterAndSort = (
  index: SearchEntry[],
  search: string,
  sort: SortOption
): NetworkUser[] => {
  const query = search.trim().toLowerCase();

  const filtered = query
    ? index.filter((entry) => entry.haystack.includes(query))
    : index;
  const users = filtered.map((entry) => entry.user);

  if (sort === 'default') return users;

  return users.sort((a, b) => {
    if (sort === 'followers') {
      return b.followers.totalCount - a.followers.totalCount;
    }
    if (sort === 'following') {
      return b.following.totalCount - a.following.totalCount;
    }
    return (a.name || a.login).localeCompare(b.name || b.login);
  });
};

export const buildSearchIndex = (data: NetworkUser[]): SearchEntry[] =>
  data.map((user) => ({
    user,
    // `\n` can't appear in a query typed into the input, so it keeps login and
    // name from matching across their boundary.
    haystack: `${user.login}\n${user.name ?? ''}`.toLowerCase(),
  }));

/**
 * Client-side search + sort over a connection list. Filtering matches login or
 * display name (case-insensitive); sorting offers follower/following count and
 * alphabetical orderings on top of the API's default order.
 *
 * The search term is deferred so typing stays responsive on large lists, and
 * the list's pagination jumps back to page 1 whenever search or sort changes.
 */
export const useListControls = (
  data: NetworkUser[],
  { listId }: { listId?: string } = {}
) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('default');
  const deferredSearch = useDeferredValue(search);
  const setCurrentPage = usePaginationStore((state) => state.setCurrentPage);

  const index = useMemo(() => buildSearchIndex(data), [data]);

  const processed = useMemo(
    () => filterAndSort(index, deferredSearch, sort),
    [index, deferredSearch, sort]
  );

  // Only a real change of search/sort resets the page — not (re)mounting, so
  // switching tabs keeps each list's page.
  const previous = useRef({ search: deferredSearch, sort });
  useEffect(() => {
    const changed =
      previous.current.search !== deferredSearch ||
      previous.current.sort !== sort;
    previous.current = { search: deferredSearch, sort };
    if (changed && listId) setCurrentPage(listId, 1);
  }, [deferredSearch, sort, listId, setCurrentPage]);

  return {
    search,
    setSearch,
    sort,
    setSort,
    processed,
    isSearching: deferredSearch.trim().length > 0,
  };
};
