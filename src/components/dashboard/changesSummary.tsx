'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { useGistStore } from '@/lib/store/gist';
import { useCacheManager } from '@/lib/hooks/useCacheManager';
import { hasChanges, type NetworkDiff } from '@/lib/networkDiff';
import { timeAgo } from '@/lib/utils';
import { LuSparkles, LuX } from 'react-icons/lu';

const CATEGORIES: Array<{
  key: keyof NetworkDiff['counts'];
  label: (n: number) => string;
  sign: '+' | '−';
}> = [
  {
    key: 'newFollowers',
    label: (n) => `new follower${n === 1 ? '' : 's'}`,
    sign: '+',
  },
  { key: 'lostFollowers', label: () => 'unfollowed you', sign: '−' },
  { key: 'newFollowing', label: () => 'followed elsewhere', sign: '+' },
  { key: 'removedFollowing', label: () => 'unfollowed elsewhere', sign: '−' },
];

/**
 * "Changes since last sync": what the latest sync found compared with the
 * previous snapshot. Persisted in the cache gist until dismissed.
 */
const ChangesSummary = () => {
  const diff = useGistStore((state) => state.lastDiff);
  const setLastDiff = useGistStore((state) => state.setLastDiff);
  const { persistChanges } = useCacheManager();
  const [expanded, setExpanded] = useState(false);

  if (!diff || diff.dismissed || !hasChanges(diff)) return null;

  const dismiss = () => {
    setLastDiff({ ...diff, dismissed: true });
    persistChanges().catch((error) => {
      console.error('Failed to save dismissal:', error);
      toast.warning('Dismissed, but saving that to your cache failed.');
    });
  };

  const visible = CATEGORIES.filter(({ key }) => diff.counts[key] > 0);

  return (
    <section
      aria-label='Changes since last sync'
      className='relative rounded-lg border bg-card p-4 text-sm'
    >
      <Button
        variant='ghost'
        size='icon'
        className='absolute top-2 right-2 size-7'
        aria-label='Dismiss changes summary'
        onClick={dismiss}
      >
        <LuX />
      </Button>
      <p className='mb-2 flex items-center gap-2 pr-8 font-semibold'>
        <LuSparkles className='text-primary' aria-hidden='true' />
        Since your previous sync ({timeAgo(diff.since)})
      </p>
      <ul className='flex flex-wrap gap-x-4 gap-y-1'>
        {visible.map(({ key, label, sign }) => (
          <li key={key}>
            <span className='font-semibold'>
              {sign}
              {diff.counts[key].toLocaleString()}
            </span>{' '}
            {label(diff.counts[key])}
          </li>
        ))}
      </ul>

      <Button
        variant='link'
        size='sm'
        className='mt-1 h-auto p-0'
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? 'Hide accounts' : 'Show accounts'}
      </Button>

      {expanded && (
        <div className='mt-2 grid gap-2'>
          {visible.map(({ key, label, sign }) => {
            const logins = diff[key];
            const extra = diff.counts[key] - logins.length;
            return (
              <div key={key}>
                <p className='text-xs font-medium text-muted-foreground'>
                  {sign} {label(diff.counts[key])}
                </p>
                <p className='break-words'>
                  {logins.map((login, i) => (
                    <React.Fragment key={login}>
                      {i > 0 && ', '}
                      <Link
                        href={`https://github.com/${login}`}
                        target='_blank'
                        rel='noreferrer'
                        className='hover:underline'
                      >
                        @{login}
                      </Link>
                    </React.Fragment>
                  ))}
                  {extra > 0 ? ` and ${extra.toLocaleString()} more` : ''}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default ChangesSummary;
