import React, { useCallback, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import TabManager from '../utils/tabsManager';
import FollowersTab from './tabs/followersTab';
import FollowingTab from './tabs/followingTab';
import NonFollowersTab from './tabs/nonFollowersTab';
import NonFollowingTab from './tabs/nonFollowingTab';
import GhostsTab from './tabs/ghostsTab';
import { Button } from '../ui/button';
import UserSettings from '../user/userSettings';
import Onboarding from './onboarding';
import { useGistStore } from '@/lib/store/gist';
import { useGhostStore } from '@/lib/store/ghost';
import { UserInfoFragment } from '@/lib/gql/types';
import { formatNumber, timeAgo } from '@/lib/utils';
import { IoSync } from 'react-icons/io5';

interface AnalyzerProps {
  refetch: () => void;
  isFetching: boolean;
  followers: UserInfoFragment[];
  following: UserInfoFragment[];
  nonMutualsYouFollow: UserInfoFragment[];
  nonMutualsFollowingYou: UserInfoFragment[];
}

const Analyzer = ({
  refetch,
  isFetching,
  followers,
  following,
  nonMutualsYouFollow,
  nonMutualsFollowingYou,
}: AnalyzerProps) => {
  const ghosts = useGhostStore((state) => state.ghosts);
  const syncedAt = useGistStore((state) => state.syncedAt);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const networkTabsData = useMemo(
    () => [
      {
        id: 'followers',
        label: `Audience (${formatNumber(followers.length)})`,
        component: <FollowersTab followers={followers} />,
      },
      {
        id: 'following',
        label: `Network (${formatNumber(following.length)})`,
        component: <FollowingTab following={following} />,
      },
      {
        id: 'one-way-out',
        label: `One-Way Out (${formatNumber(nonMutualsYouFollow.length)})`,
        component: <NonFollowersTab oneWayOut={nonMutualsYouFollow} />,
      },
      {
        id: 'one-way-in',
        label: `One-Way In (${formatNumber(nonMutualsFollowingYou.length)})`,
        component: <NonFollowingTab oneWayIn={nonMutualsFollowingYou} />,
      },
      {
        id: 'ghosts',
        label: `Ghosts (${formatNumber(ghosts.length)})`,
        component: <GhostsTab ghosts={ghosts} />,
      },
    ],
    [followers, following, nonMutualsYouFollow, nonMutualsFollowingYou, ghosts]
  );

  // The active tab lives in `?tab=` so it survives reloads and can be linked.
  const requestedTab = searchParams.get('tab');
  const activeTab = networkTabsData.some((tab) => tab.id === requestedTab)
    ? (requestedTab as string)
    : networkTabsData[0].id;

  // The native History API updates the URL (and useSearchParams) in place;
  // router.replace would make a server round-trip for the RSC payload on
  // every tab click.
  const handleTabChange = useCallback(
    (tabId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tabId);
      window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    },
    [pathname, searchParams]
  );

  return (
    // min-w-0: as a grid item the card would otherwise grow to the tab strip's
    // full width and push the whole page past a phone viewport.
    <Card className='min-w-0'>
      <CardHeader>
        <div className='mb-2 flex flex-col justify-between gap-2 md:flex-row md:items-center'>
          <div className='grid gap-1.5'>
            <CardTitle>Your Network, Deep Dive</CardTitle>
            <CardDescription>
              Explore detailed lists for comprehensive network understanding.
            </CardDescription>
          </div>

          <UserSettings />
        </div>

        <div className='flex flex-col justify-between gap-2 md:flex-row md:items-center'>
          <span className='flex items-center gap-2 text-sm text-muted-foreground'>
            <IoSync aria-hidden='true' /> Last synced:{' '}
            {syncedAt ? timeAgo(syncedAt) : 'Never'}
          </span>
          <Button size='sm' onClick={() => refetch()} disabled={isFetching}>
            <IoSync className={isFetching ? 'animate-spin' : ''} />
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className='h-full w-full overflow-hidden'>
        <Onboarding />
        <TabManager
          tabs={networkTabsData}
          value={activeTab}
          onValueChange={handleTabChange}
        />
      </CardContent>
    </Card>
  );
};

export default Analyzer;
