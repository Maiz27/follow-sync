import { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

type SubTextProps = {
  children: ReactNode;
  Tag?: 'p' | 'div';
  className?: string;
};

export const SubText = ({ children, Tag = 'p', className }: SubTextProps) => {
  return (
    <Tag
      className={twMerge(
        'max-w-2xl text-center text-lg [&:not(:first-child)]:mt-6 [&:not(:last-child)]:mb-6',
        className
      )}
    >
      {children}
    </Tag>
  );
};
