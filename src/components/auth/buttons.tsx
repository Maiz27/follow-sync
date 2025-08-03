import { ReactNode } from 'react';
import { signOut, signIn } from '@/app/auth';
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
    <form
      action={async () => {
        'use server';
        await signIn('github', { redirectTo: '/dashboard' });
      }}
    >
      <Button type='submit' className={btnClassName}>
        {children}
      </Button>
    </form>
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
    <form
      className='w-full'
      action={async () => {
        'use server';
        await signOut();
      }}
    >
      <Button
        type='submit'
        variant='destructive'
        className={cn('w-full', btnClassName)}
      >
        {children}
      </Button>
    </form>
  );
};
