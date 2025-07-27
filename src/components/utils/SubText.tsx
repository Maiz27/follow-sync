import { ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

type SubTextProps = {
  children: ReactNode;
  Tag?: 'p' | 'div';
  className?: string;
};

export const SubText = ({ children, Tag = 'p', className }: SubTextProps) => {
  return (
    <Tag className={twMerge('my-6 max-w-2xl text-center text-lg', className)}>
      {children}
    </Tag>
  );
};
