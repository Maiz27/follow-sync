import React from 'react';
import { auth, signIn } from '@/app/auth';
import Logo from './logo';
import SignOut from '../auth/signOut';
import { Button } from '../ui/button';
import { ThemeToggle } from '../theme/themeToggle';
import { Separator } from '../ui/separator';
import { LuGithub } from 'react-icons/lu';

const Navbar = () => {
  return (
    <header className='z-50 w-full bg-background'>
      <div className='flex h-[calc(.25rem*14)] w-full items-center justify-between px-4 md:px-6'>
        <div className='flex items-center'>
          <Logo />
          <span className='text-xl font-extrabold text-primary'>
            Follow Sync
          </span>
        </div>
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
      <form
        action={async () => {
          'use server';
          await signIn('github');
        }}
      >
        <Button type='submit' size='sm'>
          <LuGithub />
          Get Started
        </Button>
      </form>
    );
  }

  return <SignOut />;
};
