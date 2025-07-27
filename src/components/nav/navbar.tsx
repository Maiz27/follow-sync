import React from 'react';
import Image from 'next/image';
import { auth, signIn } from '@/app/auth';
import { Button } from '../ui/button';
import SignOut from '../auth/signOut';
import { LuGithub } from 'react-icons/lu';

const Navbar = () => {
  return (
    <header className='z-50 w-full bg-background'>
      <div className='flex h-[calc(.25rem*14)] w-full items-center justify-between px-4 md:px-6'>
        <div className='flex items-center'>
          <Image
            src='/imgs/logo/logo.png'
            alt='Follow Sync Logo'
            width={30}
            height={30}
          />
          <span className='text-xl font-extrabold text-primary'>
            Follow Sync
          </span>
        </div>
        <GetStarted />
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
