import Link from 'next/link';
import type { Session } from 'next-auth';
import { SignInButton, SignOutButton } from './buttons';
import { Button } from '../ui/button';
import { LuArrowRight, LuGithub } from 'react-icons/lu';

/**
 * Landing-page call to action. Rendered on the server with the session already
 * resolved, so signed-in visitors get a direct path to their dashboard without
 * a loading flash.
 */
const GetStarted = ({ session }: { session: Session | null }) => {
  const login = session?.user?.login;

  if (session?.user) {
    return (
      <div className='flex flex-col items-center gap-3'>
        <Button asChild size='lg'>
          <Link href='/dashboard'>
            Go to your dashboard
            <LuArrowRight />
          </Link>
        </Button>
        <p className='flex items-center gap-1 text-sm text-muted-foreground'>
          {login ? `Signed in as @${login}` : 'Signed in'}
          <span aria-hidden='true'>·</span>
          <SignOutButton
            variant='link'
            btnClassName='h-auto p-0 text-sm text-muted-foreground'
          >
            Sign out
          </SignOutButton>
        </p>
      </div>
    );
  }

  return (
    <SignInButton size='lg'>
      <LuGithub />
      Connect with GitHub to Get Started
    </SignInButton>
  );
};

export default GetStarted;
