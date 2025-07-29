'use client';

import React, { Fragment } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LuBuilding2, LuLink, LuMapPin, LuUser } from 'react-icons/lu';
import { SiX } from 'react-icons/si';
import { Separator } from '@/components/ui/separator';

export const UserCard = () => {
  const { data: session } = useSession();

  if (!session) {
    return <></>;
  }

  if (!session.user) {
    return <></>;
  }

  const user = session.user;

  console.log(user);

  const properties = [
    { icon: LuBuilding2, value: user.company },
    { icon: LuMapPin, value: user.location },
  ];

  const linkProperties = [
    {
      icon: LuUser,
      value: user.login,
      href: user.login ? `https://github.com/${user.login}` : undefined,
    },
    {
      icon: SiX,
      value: user.twitter_username,
      href: user.twitter_username
        ? `https://x.com/${user.twitter_username}`
        : undefined,
    },
    {
      icon: LuLink,
      value: 'Website',
      href: user.blog,
    },
  ];

  return (
    <Card className='h-full w-full'>
      <CardContent className='grow'>
        <div className='flex h-full w-full flex-col justify-center gap-4'>
          <div>
            <Avatar className='mx-auto h-fit w-64 overflow-hidden rounded-full md:w-40'>
              <AvatarImage src={user.image!} />
              <AvatarFallback>{user.name?.split(' ')[0][0]}</AvatarFallback>
            </Avatar>

            <div className='grid'>
              <span className='text-lg font-semibold'>{user.name}</span>
              <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                {linkProperties.map((property, index) => {
                  if (!property.value) {
                    return null;
                  }

                  return (
                    <Fragment key={index}>
                      <Separator
                        orientation='vertical'
                        className='ml-2 first:hidden'
                      />
                      <Link
                        href={property.href!}
                        target='_blank'
                        rel='noreferrer'
                        className='flex items-center gap-1 hover:underline'
                      >
                        <property.icon className='text-muted-foreground' />
                        <span>{property.value}</span>
                      </Link>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>

          <div className='flex flex-col space-y-2'>
            <p className='grow py-1 text-sm'>{user.bio}</p>

            <div className='grid gap-2 text-xs'>
              {properties.map((property, index) => {
                if (!property.value) {
                  return null;
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
      </CardContent>
    </Card>
  );
};
