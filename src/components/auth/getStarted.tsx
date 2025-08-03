import React from 'react';
import { auth } from '@/app/auth';
import { UserHoverCard } from '../user/userHoverCard';
import { SignInButton } from './buttons';
import { LuGithub } from 'react-icons/lu';

const GetStarted = async () => {
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
    <SignInButton>
      <LuGithub />
      Connect with GitHub to Get Started
    </SignInButton>
  );
};

export default GetStarted;
