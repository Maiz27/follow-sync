import React from 'react';
import Link from 'next/link';
import { auth } from '@/app/auth';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components-temp/ui/avatar';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components-temp/ui/hover-card';
import { Button } from '../ui/button';
import { LuBuilding2, LuLink, LuMapPin } from 'react-icons/lu';
import { SiX } from 'react-icons/si';

const UserHoverCard = async () => {
  const session = await auth();

  if (!session) {
    return <></>;
  }

  if (!session.user) {
    return <></>;
  }

  const user = session.user;

  const properties = [
    { icon: LuBuilding2, value: user.company },
    { icon: LuMapPin, value: user.location },
    { icon: LuLink, value: user.blog, href: user.blog },
    {
      icon: SiX,
      value: user.twitter_username,
      href: user.twitter_username
        ? `https://x.com/${user.twitter_username}`
        : undefined,
    },
  ];

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Button variant='link'>@{user.login}</Button>
      </HoverCardTrigger>
      <HoverCardContent className='w-fit max-w-md'>
        <div className='flex justify-between gap-4'>
          <Avatar className='h-fit w-24 overflow-hidden rounded-full'>
            <AvatarImage src={user.image!} />
            <AvatarFallback>{user.name?.split(' ')[0][0]}</AvatarFallback>
          </Avatar>

          <div className='space-y-2'>
            <div className='grid'>
              <span className='text-lg font-semibold'>{user.name}</span>
              <span className='text-xs text-muted-foreground'>
                @{user.login}
              </span>
            </div>

            <p className='py-1 text-sm'>{user.bio}</p>

            <div className='grid gap-2 text-xs'>
              {properties.map((property, index) => {
                if (!property.value) {
                  return null;
                }
                if (property.href) {
                  return (
                    <Link
                      key={index}
                      href={property.href}
                      target='_blank'
                      rel='noreferrer'
                      className='flex items-center gap-2 hover:underline'
                    >
                      <property.icon className='text-muted-foreground' />
                      {property.value}
                    </Link>
                  );
                }

                return (
                  <div key={index} className='flex items-center gap-2'>
                    <property.icon className='text-muted-foreground' />
                    {property.value}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default UserHoverCard;
