import React, { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { textSizes } from '@/lib/types';
import { textSizesClasses } from '@/lib/utils';

type HeadingProps = {
  children: ReactNode;
  Tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div';
  size?: textSizes;
  className?: string;
};

export const Heading = ({
  Tag = 'h2',
  size = '4xl',
  children,
  className,
}: HeadingProps) => {
  return (
    <Tag
      className={twMerge(
        `text-center font-semibold text-balance ${textSizesClasses[size]} max-w-5xl 2xl:text-5xl`,
        className
      )}
      style={{ lineHeight: 1.5 }}
    >
      {children}
    </Tag>
  );
};
