import { Section } from '../utils/section';
import { Skeleton } from '@/components/ui/skeleton';

const DashboardSkeleton = () => {
  return (
    <Section className='my-10 grid gap-2 py-0'>
      <div className='grid w-full place-items-center gap-2 md:grid-cols-2 lg:grid-cols-4'>
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className='h-40 w-full' />
        ))}
      </div>
      <Skeleton className='h-96 w-full' />
    </Section>
  );
};

export default DashboardSkeleton;
