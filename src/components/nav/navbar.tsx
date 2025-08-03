import React from 'react';
import Link from 'next/link';
import { auth } from '@/app/auth';
import Logo from './logo';
import UserDropDown from '../user/userDropDown';
import { SignInButton } from '../auth/buttons';
import { ThemeToggle } from '../theme/themeToggle';
import { Separator } from '../ui/separator';
import { LuGithub } from 'react-icons/lu';

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
