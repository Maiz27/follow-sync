'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Logo from './logo';
import UserDropDown from '../user/userDropDown';
import { SignInButton } from '../auth/buttons';
import { ThemeToggle } from '../theme/themeToggle';
import { Separator } from '../ui/separator';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { GITHUB_REPO_URL } from '@/lib/constants';
import { LuGithub, LuLayoutDashboard } from 'react-icons/lu';
import { SiGithub } from 'react-icons/si';

const Navbar = () => {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isOnDashboard = pathname?.startsWith('/dashboard');

  return (
    <header className='z-50 w-full bg-background'>
      <div className='flex h-[calc(.25rem*14)] w-full items-center justify-between px-4 md:px-6'>
        <Link href='/' className='flex items-center space-x-2'>
          <Logo />
          <span className='text-xl font-extrabold text-primary'>
            Follow Sync
          </span>
        </Link>
        <div className='flex h-4 items-center space-x-2'>
          {status === 'loading' ? (
            // Fixed-size placeholder matching the avatar trigger, so the bar
            // doesn't shift once the session resolves.
            <Skeleton aria-hidden='true' className='size-9 rounded-full' />
          ) : session ? (
            <>
              {!isOnDashboard && (
                <Button asChild size='sm' variant='outline'>
                  <Link href='/dashboard'>
                    <LuLayoutDashboard />
                    <span className='hidden sm:inline'>Dashboard</span>
                    <span className='sr-only sm:hidden'>Dashboard</span>
                  </Link>
                </Button>
              )}
              <UserDropDown />
            </>
          ) : (
            <SignInButton>
              <LuGithub />
              Get Started
            </SignInButton>
          )}

          <Separator orientation='vertical' className='ml-2' />

          <Link
            href={GITHUB_REPO_URL}
            target='_blank'
            rel='noopener noreferrer'
            aria-label='View source on GitHub'
            className='grid size-9 place-items-center text-lg hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50'
          >
            <SiGithub />
          </Link>

          <Separator orientation='vertical' className='ml-2' />

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Navbar;
