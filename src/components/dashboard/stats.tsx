import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { useCacheStore } from '@/lib/store/cache';
import { formatNumber } from '@/lib/utils';
import { LuEye, LuHeart, LuUserX, LuUserPlus } from 'react-icons/lu';

const Stats = () => {
  const { network, nonMutuals } = useCacheStore();
  const { followers, following } = network;
  const { nonMutualsFollowingYou, nonMutualsYouFollow } = nonMutuals;

  const list = [
    {
      label: 'Your Audience (Followers)',
      value: followers,
      icon: LuEye,
      description: 'Users currently following your GitHub profile.',
    },
    {
      label: 'Your Network (Following)',
      value: following,
      icon: LuHeart,
      description: 'Users you are currently following on GitHub.',
    },
    {
      label: 'One-Way Out (You Follow)',
      value: nonMutualsYouFollow,
      icon: LuUserX,
      description: 'Users you follow who have not followed you back.',
    },
    {
      label: 'One-Way In (They Follow)',
      value: nonMutualsFollowingYou,
      icon: LuUserPlus,
      description: 'Users who follow you, but you have not followed them back.',
    },
  ];

  return (
    <div className='grid w-full place-items-center gap-2 md:grid-cols-2 lg:grid-cols-4'>
      {list.map((item, index) => {
        return (
          <Card
            key={index}
            className='h-full w-full flex-col-reverse text-center'
          >
            <CardHeader className='flex flex-col'>
              <CardTitle className='flex w-full items-center justify-center gap-2'>
                <item.icon className='text-xl text-primary' />
                <h3>{item.label}</h3>
              </CardTitle>
              <CardDescription className='text-sm text-muted-foreground'>
                {item.description}
              </CardDescription>
            </CardHeader>
            <CardContent className='grid place-items-center'>
              <span className='text-5xl text-primary'>
                {formatNumber(item.value.length)}
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default Stats;
