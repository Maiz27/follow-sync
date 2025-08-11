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
import { useCacheStore } from '@/lib/store/cache';
import { UserInfoFragment } from '@/lib/gql/types';
import { formatNumber, cn } from '@/lib/utils';
import { LuGhost } from 'react-icons/lu';
import { Checkbox } from '../ui/checkbox';

type ConnectionCardProps = {
  user: UserInfoFragment;
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
  const isGhost = useCacheStore((state) => state.ghostsSet.has(user.login));

  return (
    <div className='relative'>
      {selection && !isGhost && (
        <Checkbox
          checked={selection.isSelected}
          onCheckedChange={() => selection.onSelect(user.id)}
          className='absolute top-2 right-2 z-10'
        />
      )}
      <Card
        className={cn(
          'h-full w-full transition-colors',
          selection?.isSelected && 'border-primary'
        )}
      >
        {isGhost && (
          <div className='absolute top-2 right-2'>
            <Badge variant='destructive'>
              <LuGhost />
              Ghost
            </Badge>
          </div>
        )}
        <CardHeader className='flex items-center gap-2'>
          <Avatar>
            <AvatarImage
              width={50}
              height={50}
              src={user.avatarUrl}
              alt={user.name || user.login}
              title={user.name || user.login}
              loading='lazy'
            />
            <AvatarFallback>{user.name?.split(' ')[0][0]}</AvatarFallback>
          </Avatar>

          <Link
            href={`https://github.com/${user.login}`}
            target='_blank'
            rel='noreferrer'
            className='hover:underline'
          >
            <CardTitle className='text-sm'>{user.name}</CardTitle>

            <CardDescription className='text-xs'>@{user.login}</CardDescription>
          </Link>
        </CardHeader>
        <CardContent>
          <div className='flex gap-4 text-xs'>
            <p>Followers: {formatNumber(user.followers.totalCount)}</p>
            <p>Following: {formatNumber(user.following.totalCount)}</p>
          </div>
        </CardContent>
        <CardFooter>
          {!isGhost && action && (
            <Button
              size='sm'
              variant='outline'
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

export default ConnectionCard;
