'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { SignInButton, SignOutButton } from './buttons';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { UserHoverCard } from '../user/userHoverCard';
import { LuArrowRight, LuGithub } from 'react-icons/lu';

/**
 * Landing-page call to action. A client component so the landing page itself
 * stays static (prerendered): the session is read from the client session
 * provider instead of on the server. The box has a fixed minimum height that
 * fits the signed-in layout, and the loading skeleton fills the same space,
 * so nothing below moves once the session resolves.
 */
const GetStarted = () => {
  const { data: session, status } = useSession();
  const login = session?.user?.login;

  return (
    <div
      className='flex min-h-[4.5rem] flex-col items-center gap-3'
      data-testid='get-started'
    >
      {status === 'loading' ? (
        <>
          <Skeleton aria-hidden='true' className='h-10 w-64 rounded-md' />
          <Skeleton aria-hidden='true' className='h-5 w-52 rounded-md' />
          <span className='sr-only'>Loading your session…</span>
        </>
      ) : session?.user ? (
        <>
          <Button asChild size='lg'>
            <Link href='/dashboard'>
              Go to your dashboard
              <LuArrowRight />
            </Link>
          </Button>
          <p className='flex items-center gap-1 text-sm text-muted-foreground'>
            Signed in as <UserHoverCard fallbackLogin={login} />
            <span aria-hidden='true'>·</span>
            <SignOutButton
              variant='link'
              btnClassName='h-auto p-0 text-sm text-muted-foreground'
            >
              Sign out
            </SignOutButton>
          </p>
        </>
      ) : (
        <SignInButton size='lg'>
          <LuGithub />
          Connect with GitHub to Get Started
        </SignInButton>
      )}
    </div>
  );
};

export default GetStarted;
