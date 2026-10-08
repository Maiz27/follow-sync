// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const renders = vi.hoisted(() => [] as string[]);

vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated', data: null }),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/lib/context/progress', () => ({
  useProgress: () => ({
    show: vi.fn(),
    update: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  }),
}));
// Records every render of a (memoized) card, so the test can tell whether
// the props it receives are stable.
vi.mock('@/components/dashboard/connectionCard', async () => {
  const { memo } = await import('react');
  const Card = memo(
    ({
      user,
      onSelect,
    }: {
      user: { login: string };
      onSelect?: (login: string) => void;
    }) => {
      renders.push(user.login);
      return (
        <button type='button' onClick={() => onSelect?.(user.login)}>
          select {user.login}
        </button>
      );
    }
  );
  return { default: Card };
});

import ConnectionListTab, {
  type ConnectionListAction,
} from '@/components/dashboard/tabs/connectionListTab';
import { usePaginationStore } from '@/lib/store/pagination';
import type { NetworkUser } from '@/lib/types';
import { LuHeart } from 'react-icons/lu';

const user = (login: string): NetworkUser => ({
  __typename: 'User',
  id: `id-${login}`,
  login,
  name: null,
  avatarUrl: '',
  url: '',
  followers: { totalCount: 0 },
  following: { totalCount: 0 },
  accountType: 'user',
});

const users = [user('alice'), user('bob')];
const action: ConnectionListAction = {
  label: 'Unfollow',
  verb: 'Unfollow',
  progressTitle: 'Unfollowing',
  run: async () => true,
  runSilently: async () => undefined,
  persist: async () => undefined,
  pendingLogins: new Set(),
};

describe('ConnectionListTab', () => {
  beforeEach(() => {
    renders.length = 0;
    usePaginationStore.setState({ pagination: {} });
  });

  it('re-renders only the card whose selection changed', () => {
    render(
      <ConnectionListTab
        listId='following'
        description=''
        exportName='x'
        users={users}
        action={action}
        empty={{ icon: LuHeart, title: '', description: '' }}
      />
    );
    expect(renders).toEqual(expect.arrayContaining(['alice', 'bob']));
    renders.length = 0;

    act(() => {
      fireEvent.click(screen.getByText('select alice'));
    });

    expect(renders).toEqual(['alice']);
  });
});
