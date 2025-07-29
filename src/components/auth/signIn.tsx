import React from 'react';
import { auth, signIn } from '@/app/auth';
import { Button } from '../ui/button';
import { UserHoverCard } from '../user/userHoverCard';
import { LuGithub } from 'react-icons/lu';

const SignIn = async () => {
  const session = await auth();

  if (session) {
    return (
      <div>
        <span>Signed in as</span>
        <UserHoverCard />
      </div>
    );
  }

  return (
    <>
      <form
        action={async () => {
          'use server';
          await signIn('github', { redirectTo: '/dashboard' });
        }}
      >
        <Button type='submit'>
          <LuGithub />
          Connect with GitHub to Get Started
        </Button>
      </form>
    </>
  );
};

export default SignIn;
