import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className='flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center'>
      <h1 className='text-4xl font-bold'>404</h1>
      <p className='max-w-md text-sm text-muted-foreground'>
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Button asChild>
        <Link href='/'>Back to home</Link>
      </Button>
    </div>
  );
}
