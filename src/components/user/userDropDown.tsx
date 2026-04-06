'use client';

import React from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AvatarFallback, Avatar, AvatarImage } from '../ui/avatar';
import { SignOutButton } from '../auth/buttons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { LuLayoutDashboard } from 'react-icons/lu';

const UserDropDown = () => {
  const { data: session } = useSession();

  if (!session?.user) {
    return null;
  }

  const { user } = session;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className='cursor-pointer'>
          <AvatarImage
            width={24}
            height={24}
            loading='lazy'
            src={user.image!}
            alt={user.name!}
            title={user.name!}
          />
          <AvatarFallback>{(user.name || user.login)?.[0]}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='mr-4' align='start'>
        <div className='grid px-2 py-1.5'>
          <span className='font-semibold'>{user.name}</span>
          <span className='text-xs text-muted-foreground'>@{user.login}</span>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem>
          <Link
            href='/dashboard'
            className='flex h-full w-full items-center gap-2'
          >
            <LuLayoutDashboard />
            Dashboard
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem>
          <SignOutButton>Sign out</SignOutButton>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserDropDown;
