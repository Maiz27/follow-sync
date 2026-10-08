'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { readStorage, writeStorage } from '@/lib/storage';
import { LuEllipsis, LuInfo, LuX } from 'react-icons/lu';

/** Browser preference (not account data), so it survives sign-out. */
export const ONBOARDING_STORAGE_KEY = 'follow-sync:pref:onboarding-dismissed';

const TAB_GUIDE = [
  ['Audience', 'everyone who follows you.'],
  ['Network', 'everyone you follow, including organizations.'],
  [
    'One-Way Out',
    "people you follow who don't follow back — candidates to unfollow.",
  ],
  ['One-Way In', "people who follow you that you don't follow back."],
  [
    'Ghosts',
    "deleted or suspended accounts stuck in GitHub's lists; ones you follow can be removed.",
  ],
];

/**
 * First-visit explainer for the dashboard tabs. Shown until dismissed; the
 * dismissal is remembered in this browser.
 */
const Onboarding = () => {
  // Start hidden and decide after mount so server and client markup match.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!readStorage(ONBOARDING_STORAGE_KEY));
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    writeStorage(ONBOARDING_STORAGE_KEY, String(Date.now()));
    setVisible(false);
  };

  return (
    <section
      aria-label='How the dashboard works'
      className='relative mb-4 rounded-lg border bg-muted/50 p-4 text-sm'
    >
      <Button
        variant='ghost'
        size='icon'
        className='absolute top-2 right-2 size-7'
        aria-label='Dismiss'
        onClick={dismiss}
      >
        <LuX />
      </Button>
      <p className='mb-2 flex items-center gap-2 pr-8 font-semibold'>
        <LuInfo className='text-primary' aria-hidden='true' />
        Quick tour
      </p>
      <ul className='grid gap-1'>
        {TAB_GUIDE.map(([tab, text]) => (
          <li key={tab}>
            <span className='font-medium'>{tab}</span>: {text}
          </li>
        ))}
      </ul>
      <p className='mt-2 text-muted-foreground'>
        Select cards for bulk actions, use the{' '}
        <LuEllipsis
          className='inline size-4 align-text-bottom'
          aria-label='More'
          role='img'
        />{' '}
        menu on a card to stop suggesting someone in the One-Way lists, and
        export any list as CSV or JSON. Everything is cached in a secret gist in
        your own account.
      </p>
      <Button size='sm' className='mt-3' onClick={dismiss}>
        Got it
      </Button>
    </section>
  );
};

export default Onboarding;
