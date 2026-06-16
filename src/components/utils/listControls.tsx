'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LuSearch, LuDownload } from 'react-icons/lu';
import { NetworkUser } from '@/lib/types';
import { usersToCSV, usersToJSON } from '@/lib/utils';
import type { SortOption } from '@/lib/hooks/useListControls';

type ListControlsProps = {
  search: string;
  setSearch: (value: string) => void;
  sort: SortOption;
  setSort: (value: SortOption) => void;
  /** The already filtered/sorted data, used for export. */
  data: NetworkUser[];
  /** Base name for exported files, e.g. "follow-sync-ghosts". */
  exportName: string;
};

const SORT_LABELS: Record<SortOption, string> = {
  default: 'Default order',
  followers: 'Most followers',
  following: 'Most following',
  alphabetical: 'Name (A–Z)',
};

const downloadFile = (content: string, filename: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const ListControls = ({
  search,
  setSearch,
  sort,
  setSort,
  data,
  exportName,
}: ListControlsProps) => {
  return (
    <div className='mb-3 flex flex-col gap-2 sm:flex-row sm:items-center'>
      <div className='relative flex-1'>
        <LuSearch className='pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          type='search'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Search by name or username'
          aria-label='Search connections'
          className='pl-8'
        />
      </div>

      <Select value={sort} onValueChange={(value) => setSort(value as SortOption)}>
        <SelectTrigger className='sm:w-44' aria-label='Sort connections'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
            <SelectItem key={option} value={option}>
              {SORT_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant='outline' size='sm' disabled={data.length === 0}>
            <LuDownload />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            onClick={() =>
              downloadFile(
                usersToCSV(data),
                `${exportName}.csv`,
                'text/csv;charset=utf-8'
              )
            }
          >
            Export as CSV
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              downloadFile(
                usersToJSON(data),
                `${exportName}.json`,
                'application/json'
              )
            }
          >
            Export as JSON
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default ListControls;
