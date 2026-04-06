import React from 'react';
import EmptyState from '@/components/ui/empty-state';
import PaginatedList from '@/components/utils/paginatedList';
import ConnectionCard from '../connectionCard';
import { useGhostStore } from '@/lib/store/ghost';
import { UserInfoFragment } from '@/lib/gql/types';
import { LuGhost } from 'react-icons/lu';
import { TabHeader } from './tabHeader';
import { TAB_DESCRIPTIONS } from '@/lib/constants';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const TAB_ID = 'ghosts';
const SKELETON_CARD_COUNT = 8;

type GhostsTabProps = {
  ghosts: UserInfoFragment[];
};

const GhostCardSkeleton = () => {
  return (
    <Card className='h-full w-full'>
      <CardHeader className='flex items-center gap-2'>
        <Skeleton className='size-10 rounded-full' />
        <div className='flex-1 space-y-2'>
          <Skeleton className='h-4 w-2/3' />
          <Skeleton className='h-3 w-1/2' />
        </div>
      </CardHeader>
      <CardContent>
        <div className='flex gap-4 text-xs'>
          <Skeleton className='h-3 w-20' />
          <Skeleton className='h-3 w-20' />
        </div>
      </CardContent>
      <CardFooter>
        <Skeleton className='h-9 w-24' />
      </CardFooter>
    </Card>
  );
};

const GhostsTab = ({ ghosts }: GhostsTabProps) => {
  const { isCheckingGhosts } = useGhostStore();

  if (isCheckingGhosts && ghosts.length === 0) {
    return (
      <>
        <TabHeader
          description={TAB_DESCRIPTIONS[TAB_ID]}
          selectedCount={undefined}
          action={undefined}
          selection={undefined}
        />
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
          {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
            <GhostCardSkeleton key={index} />
          ))}
        </div>
      </>
    );
  }

  if (ghosts.length === 0) {
    return (
      <EmptyState
        icon={LuGhost}
        title='No Ghosts Found'
        description="We couldn't find any ghost users in your network. Good job!"
      />
    );
  }

  return (
    <>
      <TabHeader
        description={TAB_DESCRIPTIONS[TAB_ID]}
        selectedCount={undefined}
        action={undefined}
        selection={undefined}
      />
      <PaginatedList
        listId={TAB_ID}
        data={ghosts}
        getItemKey={(item) => item!.id || item!.login}
        renderItem={(item) => <ConnectionCard user={item!} />}
      />
    </>
  );
};

export default GhostsTab;


