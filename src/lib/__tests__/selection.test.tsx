// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useSelectionManager } from '@/lib/hooks/useSelectionManager';
import { useGhostStore } from '@/lib/store/ghost';
import { usePaginationStore } from '@/lib/store/pagination';
import { useSettingsStore } from '@/lib/store/settings';

const ids = Array.from({ length: 5 }, (_, i) => `user-${i}`);

describe('useSelectionManager', () => {
  beforeEach(() => {
    useGhostStore.setState({ ghostsSet: new Set(['user-1']) });
    usePaginationStore.setState({ pagination: {} });
    useSettingsStore.setState({ paginationPageSize: 2 });
  });

  it('selects only the selectable rows of the current page', () => {
    const { result } = renderHook(() =>
      useSelectionManager('list', ids, {
        unselectableIds: new Set(['user-0']),
      })
    );

    act(() => result.current.handleSelectPage());

    // Page 1 is user-0 (org, unselectable) and user-1 (ghost, excluded).
    expect([...result.current.selectedIds]).toEqual([]);
    expect(result.current.isAllSelected).toBe(false);
  });

  it('select all picks every selectable row across pages', () => {
    const unselectable = new Set(['user-4']);
    const { result } = renderHook(() =>
      useSelectionManager('list', ids, { unselectableIds: unselectable })
    );

    act(() => result.current.handleSelectAll());

    expect([...result.current.selectedIds].sort()).toEqual([
      'user-0',
      'user-2',
      'user-3',
    ]);
    expect(result.current.selectableCount).toBe(3);

    act(() => result.current.handleSelectAll());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('drops selections that disappear from the list', () => {
    const { result, rerender } = renderHook(
      ({ list }) => useSelectionManager('list', list),
      { initialProps: { list: ids } }
    );

    act(() => result.current.handleSelect('user-3'));
    expect(result.current.selectedIds.has('user-3')).toBe(true);

    rerender({ list: ids.filter((id) => id !== 'user-3') });
    expect(result.current.selectedIds.size).toBe(0);
  });
});
