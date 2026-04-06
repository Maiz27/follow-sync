'use client';

import type { ReactNode } from 'react';
import { signIn, signOut } from 'next-auth/react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

export const SignInButton = ({
  children,
  btnClassName,
}: {
  children: ReactNode;
  btnClassName?: string;
}) => {
  return (
    <Button
      type='button'
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
}: {
  children: ReactNode;
  btnClassName?: string;
}) => {
  return (
    <Button
      type='button'
      variant='destructive'
      className={cn('w-full', btnClassName)}
      onClick={() => signOut()}
    >
      {children}
    </Button>
  );
};
