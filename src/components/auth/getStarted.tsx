'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { UserHoverCard } from '../user/userHoverCard';
import { SignInButton } from './buttons';
import { LuGithub } from 'react-icons/lu';

const GetStarted = () => {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return null;
  }

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
