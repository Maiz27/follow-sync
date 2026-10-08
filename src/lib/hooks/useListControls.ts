import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { NetworkUser } from '@/lib/types';
import { usePaginationStore } from '@/lib/store/pagination';

export type SortOption = 'default' | 'followers' | 'following' | 'alphabetical';

export type ListFilters = {
  hideOrganizations: boolean;
  hideIgnored: boolean;
};

type SearchEntry = { user: NetworkUser; haystack: string };

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Pure search + filter + sort over a connection list (exported for tests).
 * Search matches login or display name, case-insensitively, against a
 * pre-lowercased index so typing doesn't re-lowercase every name on each
 * keystroke.
 */
export const filterAndSort = (
  index: SearchEntry[],
  search: string,
  sort: SortOption,
  filters: Partial<ListFilters> = {},
  ignoredLogins: ReadonlySet<string> = EMPTY_SET
): NetworkUser[] => {
  const query = search.trim().toLowerCase();

  const users: NetworkUser[] = [];
  for (const entry of index) {
    if (query && !entry.haystack.includes(query)) continue;
    if (
      filters.hideOrganizations &&
      entry.user.accountType === 'organization'
    ) {
      continue;
    }
    if (
      filters.hideIgnored &&
      ignoredLogins.has(entry.user.login.toLowerCase())
    ) {
      continue;
    }
    users.push(entry.user);
  }

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
 * Client-side search, filters and sort over a connection list. Filtering
 * matches login or display name (case-insensitive) and can hide organizations
 * or ignored accounts; sorting offers follower/following count and
 * alphabetical orderings on top of the API's default order.
 *
 * The search term is deferred so typing stays responsive on large lists, and
 * the list's pagination jumps back to page 1 whenever search, sort or filters
 * change.
 */
export const useListControls = (
  data: NetworkUser[],
  {
    listId,
    ignoredLogins = EMPTY_SET,
    defaultFilters,
  }: {
    listId?: string;
    ignoredLogins?: ReadonlySet<string>;
    defaultFilters?: Partial<ListFilters>;
  } = {}
) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('default');
  const [filters, setFilters] = useState<ListFilters>({
    hideOrganizations: false,
    hideIgnored: false,
    ...defaultFilters,
  });
  const deferredSearch = useDeferredValue(search);
  const setCurrentPage = usePaginationStore((state) => state.setCurrentPage);

  const index = useMemo(() => buildSearchIndex(data), [data]);

  const processed = useMemo(
    () => filterAndSort(index, deferredSearch, sort, filters, ignoredLogins),
    [index, deferredSearch, sort, filters, ignoredLogins]
  );

  // Which filters are worth offering for this list.
  const availableFilters = useMemo(
    () => ({
      organizations: data.filter((u) => u.accountType === 'organization')
        .length,
      ignored: data.filter((u) => ignoredLogins.has(u.login.toLowerCase()))
        .length,
    }),
    [data, ignoredLogins]
  );

  // Only a real change of search/sort/filters resets the page — not
  // (re)mounting, so switching tabs keeps each list's page.
  const previous = useRef({ search: deferredSearch, sort, filters });
  useEffect(() => {
    const changed =
      previous.current.search !== deferredSearch ||
      previous.current.sort !== sort ||
      previous.current.filters !== filters;
    previous.current = { search: deferredSearch, sort, filters };
    if (changed && listId) setCurrentPage(listId, 1);
  }, [deferredSearch, sort, filters, listId, setCurrentPage]);

  const setFilter = (key: keyof ListFilters, value: boolean) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  return {
    search,
    setSearch,
    sort,
    setSort,
    filters,
    setFilter,
    availableFilters,
    processed,
    isSearching: deferredSearch.trim().length > 0,
  };
};
