import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../ui/card';
import { formatNumber } from '@/lib/utils';
import { IconType } from 'react-icons';

export interface StatData {
  label: string;
  value: number;
  icon: IconType;
  description: string;
}

interface StatsProps {
  list: StatData[];
}

const Stats = ({ list }: StatsProps) => {
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
                {formatNumber(item.value)}
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default Stats;
