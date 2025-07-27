import React from 'react';
import { twMerge } from 'tailwind-merge';

type SectionProps = {
  children: React.ReactNode;
  id?: string;
  Tag?: 'section' | 'div' | 'header' | 'footer' | 'nav';
  className?: string;
};

export const Section = ({
  Tag = 'section',
  id,
  children,
  className,
}: SectionProps) => {
  return (
    <Tag
      id={id}
      className={twMerge(
        'mx-auto w-full max-w-7xl px-4 py-20 md:px-8',
        className
      )}
    >
      {children}
    </Tag>
  );
};
