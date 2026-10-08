// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  session: {
    status: 'unauthenticated' as
      | 'loading'
      | 'authenticated'
      | 'unauthenticated',
    data: null as null | { user: { login: string } },
  },
  pathname: '/',
}));

vi.mock('next-auth/react', () => ({
  useSession: () => mocks.session,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
// Server-only auth must never be needed to render the (static) landing page.
vi.mock('@/app/auth', () => {
  throw new Error('the landing page must not read the session on the server');
});

import Home from '@/app/page';
import Navbar from '@/components/nav/navbar';

const setSession = (status: typeof mocks.session.status) => {
  mocks.session.status = status;
  mocks.session.data =
    status === 'authenticated' ? { user: { login: 'octocat' } } : null;
};

afterEach(() => {
  cleanup();
  mocks.pathname = '/';
});

describe('landing page', () => {
  it('renders synchronously, without a server session (stays static)', () => {
    setSession('unauthenticated');
    expect(Home.constructor.name).not.toBe('AsyncFunction');
    render(<Home />);
    expect(
      screen.getByRole('button', { name: /connect with github/i })
    ).toBeTruthy();
  });

  it('shows a fixed-size skeleton while the session loads', () => {
    setSession('loading');
    render(<Home />);
    const cta = screen.getByTestId('get-started');
    expect(cta.className).toContain('min-h-[4.5rem]');
    expect(cta.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /connect with github/i })).toBe(
      null
    );
  });

  it('links signed-in visitors to their dashboard', () => {
    setSession('authenticated');
    render(<Home />);
    const link = screen.getByRole('link', { name: /go to your dashboard/i });
    expect(link.getAttribute('href')).toBe('/dashboard');
    expect(screen.getByText('@octocat')).toBeTruthy();
  });
});

describe('navbar', () => {
  it('shows the Dashboard button to signed-in visitors off the dashboard', () => {
    setSession('authenticated');
    render(<Navbar />);
    expect(
      screen
        .getAllByRole('link', { name: /dashboard/i })[0]
        .getAttribute('href')
    ).toBe('/dashboard');
  });

  it('hides the Dashboard button on the dashboard', () => {
    setSession('authenticated');
    mocks.pathname = '/dashboard';
    render(<Navbar />);
    expect(screen.queryByRole('link', { name: /dashboard/i })).toBe(null);
  });

  it('offers sign-in to signed-out visitors', () => {
    setSession('unauthenticated');
    render(<Navbar />);
    expect(screen.getByRole('button', { name: /get started/i })).toBeTruthy();
  });
});
