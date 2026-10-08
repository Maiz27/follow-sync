// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams('tab=followers&x=1'),
}));
vi.mock('@/components/utils/tabsManager', () => ({
  default: ({
    tabs,
    onValueChange,
  }: {
    tabs: Array<{ id: string }>;
    onValueChange: (id: string) => void;
  }) => (
    <div>
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => onValueChange(tab.id)}>
          {tab.id}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('@/components/user/userSettings', () => ({ default: () => null }));
vi.mock('@/components/dashboard/onboarding', () => ({ default: () => null }));
for (const tab of [
  'followersTab',
  'followingTab',
  'nonFollowersTab',
  'nonFollowingTab',
  'ghostsTab',
]) {
  vi.doMock(`@/components/dashboard/tabs/${tab}`, () => ({
    default: () => null,
  }));
}

describe('Analyzer tabs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mirrors the tab in the URL without a router navigation', async () => {
    const { default: Analyzer } =
      await import('@/components/dashboard/analyzer');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    render(
      <Analyzer
        refetch={() => undefined}
        isFetching={false}
        followers={[]}
        following={[]}
        nonMutualsYouFollow={[]}
        nonMutualsFollowingYou={[]}
      />
    );
    fireEvent.click(screen.getByText('ghosts'));

    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      '/dashboard?tab=ghosts&x=1'
    );
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
  });
});
