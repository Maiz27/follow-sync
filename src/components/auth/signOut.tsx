import React from 'react';
import { signOut } from '@/app/auth';
import { Button } from '../ui/button';

const SignOut = async () => {
  return (
    <form
      className='w-full'
      action={async () => {
        'use server';
        await signOut();
      }}
    >
      <Button type='submit' variant='destructive' className='w-full'>
        Sign out
      </Button>
    </form>
  );
};

export default SignOut;
