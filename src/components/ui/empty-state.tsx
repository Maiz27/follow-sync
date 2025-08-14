import { cn } from '@/lib/utils';
import { IconType } from 'react-icons';

interface EmptyStateProps {
  icon: IconType;
  title: string;
  description: string;
  className?: string;
}

const EmptyState = ({
  icon: Icon,
  title,
  description,
  className,
}: EmptyStateProps) => {
  return (
    <div
      className={cn(
        'flex min-h-40 flex-col items-center justify-center space-y-4 rounded-lg p-8 text-center',
        className
      )}
    >
      <div className='rounded-full bg-primary/10 p-4'>
        <Icon className='text-2xl text-primary' />
      </div>
      <h2 className='text-xl font-semibold'>{title}</h2>
      <p className='text-muted-foreground'>{description}</p>
    </div>
  );
};

export default EmptyState;
