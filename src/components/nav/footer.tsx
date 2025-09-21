import Link from 'next/link';
import { Separator } from '../ui/separator';

const Footer = () => {
  return (
    <footer className='w-full bg-background'>
      <Separator />
      <div className='mx-auto flex h-14 max-w-4xl items-center justify-center space-x-4 px-4 text-sm text-muted-foreground'>
        <Link href='/terms' className='hover:text-primary'>
          Terms of Service
        </Link>
        <Separator orientation='vertical' />
        <Link href='/privacy' className='hover:text-primary'>
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
