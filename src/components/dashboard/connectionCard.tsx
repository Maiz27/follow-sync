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
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { UserInfoFragment } from '@/lib/gql/types';
import { formatNumber } from '@/lib/utils';

import { Badge } from '../ui/badge';
import { LuGhost } from 'react-icons/lu';

type ConnectionCardProps = {
  user: UserInfoFragment;
  children?: React.ReactNode;
  isGhost?: boolean;
};

const ConnectionCard = ({ user, children, isGhost }: ConnectionCardProps) => {
  return (
    <Card className='relative'>
      {isGhost && (
        <div className='absolute top-0 right-0'>
          <Badge variant='destructive'>
            <LuGhost />
            Ghost
          </Badge>
        </div>
      )}
      <CardHeader className='flex items-center gap-2'>
        <Avatar>
          <AvatarImage src={user.avatarUrl} loading='lazy' />
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
      <CardFooter>{children}</CardFooter>
    </Card>
  );
};

export default ConnectionCard;
