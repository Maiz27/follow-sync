'use client';

import * as React from 'react';
import { LuMoon, LuSun } from 'react-icons/lu';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className=''>
        <Button variant='ghost' size='icon' className=''>
          <LuSun className='h-24 w-24 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90' />
          <LuMoon className='absolute h-24 w-24 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0' />
          <span className='sr-only'>Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem
          className='hover:cursor-pointer'
          onClick={() => setTheme('light')}
        >
          <span>Light</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className='hover:cursor-pointer'
          onClick={() => setTheme('dark')}
        >
          <span>Dark</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className='hover:cursor-pointer'
          onClick={() => setTheme('system')}
        >
          <span>System</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
