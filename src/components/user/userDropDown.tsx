'use client';

import React from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AvatarFallback, Avatar, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
import { signOutAndReset } from '../auth/buttons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { LuLayoutDashboard, LuLogOut } from 'react-icons/lu';

const UserDropDown = () => {
  const { data: session } = useSession();

  if (!session?.user) {
    return null;
  }

  const { user } = session;
  const displayName = user.name || user.login || 'Your account';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* A real button so the menu is reachable and operable by keyboard. */}
        <Button
          variant='ghost'
          size='icon'
          aria-label='Account menu'
          className='rounded-full'
        >
          <Avatar>
            <AvatarImage
              width={24}
              height={24}
              loading='lazy'
              src={user.image ?? undefined}
              alt=''
              title={displayName}
            />
            <AvatarFallback>{displayName[0]}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='mr-4' align='end'>
        <div className='grid px-2 py-1.5'>
          <span className='font-semibold'>{user.name}</span>
          <span className='text-xs text-muted-foreground'>@{user.login}</span>
        </div>

        <DropdownMenuSeparator />

        {/* asChild makes the Link itself the menu item, so Enter/Space and
            clicks anywhere on the row navigate. */}
        <DropdownMenuItem asChild className='px-2 py-1.5'>
          <Link href='/dashboard'>
            <LuLayoutDashboard />
            Dashboard
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant='destructive'
          className='px-2 py-1.5'
          onSelect={() => signOutAndReset()}
        >
          <LuLogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserDropDown;
