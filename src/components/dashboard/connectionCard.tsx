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
import { LuGhost, LuBuilding2, LuEllipsis, LuEyeOff } from 'react-icons/lu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Checkbox } from '../ui/checkbox';
import { useSettingsStore } from '@/lib/store/settings';

/**
 * Props are flat primitives and callbacks that receive the row, so lists can
 * pass the same (stable) callbacks to every card and `React.memo` skips cards
 * whose own state didn't change.
 */
type ConnectionCardProps = {
  user: NetworkUser;
  /** Action button label; the button shows only with `onAction`. */
  actionLabel?: string;
  actionLoading?: boolean;
  onAction?: (user: NetworkUser) => void;
  /** Selection checkbox; shown only with `onSelect`. */
  isSelected?: boolean;
  onSelect?: (login: string) => void;
  /** Ignore-list menu ("never suggest @x in the One-Way lists"). */
  isIgnored?: boolean;
  onToggleIgnore?: (login: string) => void;
};

const ConnectionCard = ({
  user,
  actionLabel,
  actionLoading,
  onAction,
  isSelected = false,
  onSelect,
  isIgnored = false,
  onToggleIgnore,
}: ConnectionCardProps) => {
  const isGhostInStore = useGhostStore((state) => state.isGhost(user.login));
  const showAvatars = useSettingsStore((state) => state.showAvatars);

  // Prefer the classification carried on the user; fall back to the ghost
  // store for any data that predates the `accountType` field.
  const accountType = user.accountType ?? (isGhostInStore ? 'ghost' : 'user');
  const isGhost = accountType === 'ghost';
  const isOrg = accountType === 'organization';

  const displayName = user.name || user.login || '?';
  const initial = displayName.charAt(0);

  // Organizations can't be followed back and are surfaced for awareness only,
  // so they get no selection checkbox or action button.
  const canSelect = Boolean(onSelect) && !isOrg;
  const canAct = Boolean(onAction) && !isOrg;

  return (
    <div className='relative'>
      {canSelect && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelect?.(user.login)}
          aria-label={`Select @${user.login}`}
          className='absolute top-2 right-2 z-10'
        />
      )}
      <Card
        className={cn(
          'h-full w-full transition-colors',
          isSelected && 'border-primary'
        )}
      >
        {(isGhost || isOrg || isIgnored) && (
          <div
            className={cn('absolute top-2', canSelect ? 'right-10' : 'right-2')}
          >
            {isGhost ? (
              <Badge variant='destructive'>
                <LuGhost />
                Ghost
              </Badge>
            ) : isOrg ? (
              <Badge variant='secondary'>
                <LuBuilding2 />
                Org
              </Badge>
            ) : (
              <Badge variant='outline' title='Not suggested in One-Way lists'>
                <LuEyeOff />
                Ignored
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
        <CardFooter className='gap-2'>
          {canAct && (
            <Button
              size='sm'
              variant={isGhost ? 'destructive' : 'outline'}
              onClick={() => onAction?.(user)}
              disabled={actionLoading}
              className={actionLoading ? 'animate-pulse cursor-progress' : ''}
            >
              {actionLabel}
            </Button>
          )}
          {onToggleIgnore && !isGhost && !isOrg && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size='icon'
                  variant='ghost'
                  className='ml-auto size-8'
                  aria-label={`More actions for @${user.login}`}
                >
                  <LuEllipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                <DropdownMenuItem
                  className='px-2 py-1.5'
                  onSelect={() => onToggleIgnore(user.login)}
                >
                  <LuEyeOff />
                  {isIgnored
                    ? 'Suggest in One-Way lists again'
                    : 'Never suggest in One-Way lists'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default React.memo(ConnectionCard);
