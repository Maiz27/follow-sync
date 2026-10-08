import GetStarted from '@/components/auth/getStarted';
import DashboardPreview from '@/components/landing/dashboardPreview';
import { Heading } from '@/components/utils/heading';
import { Section } from '@/components/utils/section';
import { SubText } from '@/components/utils/subText';
import { LuGithub, LuLock, LuSearch, LuUsers } from 'react-icons/lu';

const HOW_IT_WORKS = [
  {
    icon: LuGithub,
    title: 'Connect GitHub',
    body: 'Sign in with GitHub. Follow Sync asks only for read:user, user:follow and gist access.',
  },
  {
    icon: LuSearch,
    title: 'See who is in sync',
    body: 'Your followers and following are compared to find one-way connections, organizations and ghost accounts.',
  },
  {
    icon: LuUsers,
    title: 'Act on it',
    body: 'Follow back, unfollow or remove ghosts one at a time or in bulk, with search, sort and CSV/JSON export.',
  },
];

export default function Home() {
  return (
    <>
      <Section className='grid place-items-center pt-16 pb-10 md:pt-24'>
        <Heading Tag='h1'>
          {`Master Your GitHub Connections: Know Who's Really Following`}
        </Heading>
        <SubText>
          A clear view of who follows you, who you follow back, and the ghosts
          left behind.
        </SubText>

        <GetStarted />
      </Section>

      <Section className='py-6'>
        <DashboardPreview />
      </Section>

      <Section className='grid gap-10 py-20'>
        <Heading size='3xl' className='text-left'>
          How it works
        </Heading>
        <ol className='grid gap-8 md:grid-cols-3'>
          {HOW_IT_WORKS.map((step, index) => (
            <li
              key={step.title}
              className='grid content-start gap-3 border-t pt-5'
            >
              <span className='text-sm text-muted-foreground tabular-nums'>
                {index + 1}
              </span>
              <h3 className='flex items-center gap-2 text-lg font-semibold'>
                <step.icon aria-hidden='true' />
                {step.title}
              </h3>
              <p className='text-muted-foreground'>{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section className='grid place-items-center gap-4 pt-4 pb-24 text-center'>
        <LuLock className='text-3xl' aria-hidden='true' />
        <Heading size='3xl'>Your data stays in your private gist</Heading>
        <SubText className='[&:not(:first-child)]:mt-0'>
          Follow Sync never stores your network on its servers. Your GitHub
          token stays in an encrypted, server-only session cookie, and your
          network is cached in a secret gist that you own and can delete at any
          time.
        </SubText>
      </Section>
    </>
  );
}
