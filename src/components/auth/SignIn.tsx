import React from 'react';
import { Button } from '../ui/button';
import { auth, signIn } from '@/app/auth';
import { LuGithub } from 'react-icons/lu';

const SignIn = async () => {
  const session = await auth();

  if (session) {
    console.log(session);
    return <p>Signed in as {session.user?.login}</p>;
  }

  return (
    <>
      <form
        action={async () => {
          'use server';
          await signIn('github');
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
