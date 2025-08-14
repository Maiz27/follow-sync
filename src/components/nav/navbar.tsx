import React from 'react';
import Link from 'next/link';
import { auth } from '@/app/auth';
import Logo from './logo';
import UserDropDown from '../user/userDropDown';
import { SignInButton } from '../auth/buttons';
import { ThemeToggle } from '../theme/themeToggle';
import { Separator } from '../ui/separator';
import { GITHUB_REPO_URL } from '@/lib/constants';
import { LuGithub } from 'react-icons/lu';
import { SiGithub } from 'react-icons/si';

const Navbar = () => {
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
          <GetStarted />

          <Separator orientation='vertical' className='ml-2' />

          <Link
            href={GITHUB_REPO_URL}
            target='_blank'
            rel='noopener noreferrer'
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

const GetStarted = async () => {
  const session = await auth();
  if (!session) {
    return (
      <SignInButton>
        <LuGithub />
        Get Started
      </SignInButton>
    );
  }

  return <UserDropDown />;
};
