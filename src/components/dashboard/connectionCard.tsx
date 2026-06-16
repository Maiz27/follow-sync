import React from 'react';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useGhostStore } from '@/lib/store/ghost';
import { NetworkUser } from '@/lib/types';
import { formatNumber, cn } from '@/lib/utils';
import { LuGhost, LuBuilding2 } from 'react-icons/lu';
import { Checkbox } from '../ui/checkbox';
import { useSettingsStore } from '@/lib/store/settings';

type ConnectionCardProps = {
  user: NetworkUser;
  action?: {
    label: string;
    onClick: () => void;
    isDisabled?: boolean;
    loading?: boolean;
  };
  selection?: {
    isSelected: boolean;
    onSelect: (id: string) => void;
  };
};

const ConnectionCard = ({ user, selection, action }: ConnectionCardProps) => {
  const { onClick, label, loading, isDisabled } = action || {};
  const isGhostInStore = useGhostStore((state) => state.isGhost(user.login));
  const showAvatars = useSettingsStore((state) => state.showAvatars);

  // Prefer the classification carried on the user; fall back to the ghost
  // store for any data that predates the `accountType` field.
  const accountType =
    user.accountType ?? (isGhostInStore ? 'ghost' : 'user');
  const isGhost = accountType === 'ghost';
  const isOrg = accountType === 'organization';

  const displayName = user.name || user.login || '?';
  const initial = displayName.charAt(0);

  // Organizations can't be followed back and are surfaced for awareness only,
  // so they get no selection checkbox or action button.
  const canSelect = Boolean(selection) && !isOrg;
  const canAct = Boolean(action) && !isOrg;

  return (
    <div className='relative'>
      {canSelect && (
        <Checkbox
          checked={selection!.isSelected}
          onCheckedChange={() => selection!.onSelect(user.login)}
          aria-label={`Select @${user.login}`}
          className='absolute top-2 right-2 z-10'
        />
      )}
      <Card
        className={cn(
          'h-full w-full transition-colors',
          selection?.isSelected && 'border-primary'
        )}
      >
        {(isGhost || isOrg) && (
          <div className={cn('absolute top-2', canSelect ? 'right-10' : 'right-2')}>
            {isGhost ? (
              <Badge variant='destructive'>
                <LuGhost />
                Ghost
              </Badge>
            ) : (
              <Badge variant='secondary'>
                <LuBuilding2 />
                Org
              </Badge>
            )}
          </div>
        )}
        <CardHeader className='flex items-center gap-2'>
          {showAvatars ? (
            <Avatar>
              <AvatarImage
                width={50}
                height={50}
                src={user.avatarUrl}
                alt={`${displayName}'s avatar`}
                title={displayName}
                loading='lazy'
              />
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          ) : (
            <div className='flex size-8 items-center justify-center rounded-full bg-muted'>
              {initial}
            </div>
          )}

          <Link
            href={`https://github.com/${user.login}`}
            target='_blank'
            rel='noreferrer'
            className='hover:underline'
          >
            <CardTitle className='text-sm'>{displayName}</CardTitle>

            <CardDescription className='text-xs'>@{user.login}</CardDescription>
          </Link>
        </CardHeader>
        {!isGhost && !isOrg && (
          <CardContent>
            <div className='flex gap-4 text-xs'>
              <p>Followers: {formatNumber(user.followers.totalCount)}</p>
              <p>Following: {formatNumber(user.following.totalCount)}</p>
            </div>
          </CardContent>
        )}
        <CardFooter>
          {canAct && (
            <Button
              size='sm'
              variant={isGhost ? 'destructive' : 'outline'}
              onClick={onClick}
              disabled={isDisabled || loading}
              className={loading ? 'animate-pulse cursor-progress' : ''}
            >
              {label}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default React.memo(ConnectionCard);
