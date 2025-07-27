import React from 'react';
import { auth, signOut } from '@/app/auth';
import { AvatarFallback, Avatar, AvatarImage } from '../ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Button } from '../ui/button';

const SignOut = async () => {
  const session = await auth();

  if (!session) {
    return null;
  }

  const { user } = session;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className='cursor-pointer'>
          <AvatarImage src={user.image!} alt={user.name!} />
          <AvatarFallback>{user.name?.split(' ')[0]![0]}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='mr-4' align='start'>
        <div className='grid px-2 py-1.5'>
          <span className='font-semibold'>{user.name}</span>
          <span className='text-xs text-muted-foreground'>@{user.login}</span>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem className='focus:'>
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
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SignOut;
