// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  buildSearchIndex,
  filterAndSort,
  useListControls,
} from '@/lib/hooks/useListControls';
import { usePaginatedList } from '@/lib/hooks/usePaginatedList';
import { usePaginationStore } from '@/lib/store/pagination';
import { useSettingsStore } from '@/lib/store/settings';
import type { NetworkUser } from '@/lib/types';

const makeUser = (
  login: string,
  name: string | null,
  followers: number
): NetworkUser => ({
  __typename: 'User',
  id: `id-${login}`,
  login,
  name,
  avatarUrl: '',
  url: '',
  followers: { totalCount: followers },
  following: { totalCount: 0 },
});

const users = [
  makeUser('alice', 'Alice Smith', 5),
  makeUser('bob', null, 50),
  makeUser('carol', 'Carol B', 10),
];

describe('filterAndSort', () => {
  const index = buildSearchIndex(users);

  it('matches login or name case-insensitively', () => {
    expect(
      filterAndSort(index, 'SMITH', 'default').map((u) => u.login)
    ).toEqual(['alice']);
    expect(filterAndSort(index, ' bo ', 'default').map((u) => u.login)).toEqual(
      ['bob']
    );
  });

  it('sorts by followers and alphabetically', () => {
    expect(filterAndSort(index, '', 'followers').map((u) => u.login)).toEqual([
      'bob',
      'carol',
      'alice',
    ]);
    expect(
      filterAndSort(index, '', 'alphabetical').map((u) => u.login)
    ).toEqual(['alice', 'bob', 'carol']);
  });

  it('does not reorder the source list', () => {
    filterAndSort(index, '', 'followers');
    expect(index.map((e) => e.user.login)).toEqual(['alice', 'bob', 'carol']);
  });
});

describe('useListControls', () => {
  beforeEach(() => usePaginationStore.setState({ pagination: {} }));

  it('jumps back to page 1 when the search changes', () => {
    usePaginationStore.getState().setCurrentPage('list', 3);
    const { result } = renderHook(() =>
      useListControls(users, { listId: 'list' })
    );

    // Mounting keeps the page.
    expect(usePaginationStore.getState().pagination.list.currentPage).toBe(3);

    act(() => result.current.setSearch('al'));
    expect(usePaginationStore.getState().pagination.list.currentPage).toBe(1);
  });
});

describe('usePaginatedList', () => {
  beforeEach(() => {
    usePaginationStore.setState({ pagination: {} });
    useSettingsStore.setState({ paginationPageSize: 10 });
  });

  const data = Array.from({ length: 95 }, (_, i) => i);

  it('slices the current page and counts pages', () => {
    usePaginationStore.getState().setCurrentPage('p', 10);
    const { result } = renderHook(() =>
      usePaginatedList({ listId: 'p', data })
    );
    expect(result.current.totalPages).toBe(10);
    expect(result.current.currentPageItems).toEqual([90, 91, 92, 93, 94]);
  });

  it('shows ellipses around the current page', () => {
    usePaginationStore.getState().setCurrentPage('p', 5);
    const { result } = renderHook(() =>
      usePaginatedList({ listId: 'p', data })
    );
    expect(result.current.displayedPageNumbers).toEqual([
      1,
      '...',
      3,
      4,
      5,
      6,
      7,
      '...',
      10,
    ]);
  });

  it('clamps to the last page when the list shrinks', () => {
    usePaginationStore.getState().setCurrentPage('p', 10);
    const { rerender } = renderHook(
      ({ items }) => usePaginatedList({ listId: 'p', data: items }),
      { initialProps: { items: data } }
    );
    rerender({ items: data.slice(0, 25) });
    expect(usePaginationStore.getState().pagination.p.currentPage).toBe(3);
  });

  it('clamps page navigation to valid pages', () => {
    const { result } = renderHook(() =>
      usePaginatedList({ listId: 'p', data })
    );
    act(() => result.current.goToPage(99));
    expect(usePaginationStore.getState().pagination.p.currentPage).toBe(10);
    act(() => result.current.goToPage(-1));
    expect(usePaginationStore.getState().pagination.p.currentPage).toBe(1);
  });
});
