'use client';

import React from 'react';
import Stats from '@/components/dashboard/stats';
import ConnectionCard from '@/components/dashboard/connectionCard';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { STATS_DATA } from '@/lib/constants';
import { NetworkUser } from '@/lib/types';
import { formatNumber } from '@/lib/utils';

/**
 * Illustrative numbers only; the landing page never has a visitor's data.
 * The same components the dashboard renders, so the preview cannot drift
 * from the real thing.
 */
const SAMPLE_STATS = [
  { ...STATS_DATA[0], value: 1234 },
  { ...STATS_DATA[1], value: 567 },
  { ...STATS_DATA[2], value: 89 },
  { ...STATS_DATA[3], value: 123 },
];

const sampleUser = (
  login: string,
  name: string,
  followers: number,
  following: number
): NetworkUser => ({
  id: `sample-${login}`,
  login,
  name,
  // No remote avatar: the card falls back to the initial, and the CSP only
  // allows GitHub's avatar host anyway.
  avatarUrl: '',
  url: `https://github.com/${login}`,
  followers: { totalCount: followers },
  following: { totalCount: following },
  accountType: 'user',
});

/** Invented accounts; none of these logins belongs to a real person on purpose. */
const SAMPLE_ONE_WAY_OUT: NetworkUser[] = [
  sampleUser('nadia-okafor', 'Nadia Okafor', 1284, 312),
  sampleUser('tomasz-wrobel', 'Tomasz Wróbel', 92, 418),
  sampleUser('priya-raman-dev', 'Priya Raman', 3410, 57),
];

const SAMPLE_TABS = [
  { id: 'followers', label: `Audience (${formatNumber(1234)})` },
  { id: 'following', label: `Network (${formatNumber(567)})` },
  { id: 'one-way-out', label: `One-Way Out (${formatNumber(89)})` },
  { id: 'one-way-in', label: `One-Way In (${formatNumber(123)})` },
  { id: 'ghosts', label: `Ghosts (${formatNumber(4)})` },
];

const noop = () => undefined;

/**
 * A non-interactive slice of the real dashboard: the stat row, the list
 * tabs and three One-Way Out cards with the Unfollow action they carry
 * there. `inert` keeps every control out of the tab order and away from the
 * pointer, so nothing in the preview can be mistaken for the product.
 */
const DashboardPreview = () => {
  return (
    <figure className='grid min-w-0 gap-3'>
      <figcaption className='text-sm text-muted-foreground'>
        The dashboard, with sample accounts. Yours shows your own network.
      </figcaption>
      <div
        inert
        aria-hidden='true'
        className='grid min-w-0 gap-4 border bg-muted/30 p-3 md:p-4'
      >
        <Stats list={SAMPLE_STATS} />
        <Tabs value='one-way-out' onValueChange={noop} className='min-w-0'>
          <div className='w-full min-w-0 overflow-x-auto bg-muted'>
            <TabsList className='h-auto w-max min-w-full flex-nowrap justify-start gap-1 px-1 py-1 lg:justify-evenly'>
              {SAMPLE_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className='flex-none py-1.5 lg:flex-1'
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
        <p className='text-sm text-muted-foreground'>
          Users you follow who have not followed you back.
        </p>
        <ul className='grid gap-2 md:grid-cols-3'>
          {SAMPLE_ONE_WAY_OUT.map((user) => (
            <li key={user.login}>
              <ConnectionCard
                user={user}
                actionLabel='Unfollow'
                onAction={noop}
                isSelected={false}
                onSelect={noop}
              />
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
};

export default DashboardPreview;
