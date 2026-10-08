'use client';

import type { ComponentProps, ReactNode } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { clearUserStorage } from '@/lib/storage';

/**
 * Signs the user out and returns them to the landing page. Shared by every
 * sign-out entry point (dropdown, landing page) so they behave identically.
 * Account-scoped localStorage (the remembered cache gist id) is cleared first,
 * so the next account on this browser can't pick up the previous one's cache.
 */
export const signOutAndReset = () => {
  clearUserStorage();
  return signOut({ redirectTo: '/' });
};

export const SignInButton = ({
  children,
  btnClassName,
  size,
}: {
  children: ReactNode;
  btnClassName?: string;
  size?: ComponentProps<typeof Button>['size'];
}) => {
  return (
    <Button
      type='button'
      size={size}
      className={btnClassName}
      onClick={() => signIn('github', { redirectTo: '/dashboard' })}
    >
      {children}
    </Button>
  );
};

export const SignOutButton = ({
  children,
  btnClassName,
  variant = 'destructive',
}: {
  children: ReactNode;
  btnClassName?: string;
  variant?: ComponentProps<typeof Button>['variant'];
}) => {
  return (
    <Button
      type='button'
      variant={variant}
      className={cn(variant === 'destructive' && 'w-full', btnClassName)}
      onClick={() => signOutAndReset()}
    >
      {children}
    </Button>
  );
};
