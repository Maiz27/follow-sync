import GetStarted from '@/components/auth/getStarted';
import Stats from '@/components/dashboard/stats';
import { Heading } from '@/components/utils/heading';
import { Section } from '@/components/utils/section';
import { SubText } from '@/components/utils/subText';
import { STATS_DATA } from '@/lib/constants';
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
  // Illustrative numbers only — the landing page never has your real data.
  const sampleStats = [
    { ...STATS_DATA[0], value: 1234 },
    { ...STATS_DATA[1], value: 567 },
    { ...STATS_DATA[2], value: 89 },
    { ...STATS_DATA[3], value: 123 },
  ];

  return (
    <>
      <Section className='grid place-items-center pt-20 pb-0'>
        <Heading Tag='h1'>
          {`Master Your GitHub Connections: Know Who's Really Following`}
        </Heading>
        <SubText>
          {`Take control of your GitHub presence. Follow Sync provides a clear,
          real-time view of your followers and who you follow back, ensuring
          you're always in sync with your professional network.`}
        </SubText>

        <GetStarted />
      </Section>

      <Section className='py-10'>
        <p className='mb-3 text-center text-sm text-muted-foreground'>
          Sample dashboard — example numbers. Your own appear on your dashboard.
        </p>
        <Stats list={sampleStats} />
      </Section>

      <Section className='grid gap-8 py-10'>
        <Heading size='3xl'>How it works</Heading>
        <ol className='grid gap-4 md:grid-cols-3'>
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.title} className='rounded-lg border p-5'>
              <div className='mb-2 flex items-center gap-2 font-semibold'>
                <step.icon className='text-primary' aria-hidden='true' />
                <span>
                  {index + 1}. {step.title}
                </span>
              </div>
              <p className='text-sm text-muted-foreground'>{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section className='grid place-items-center gap-4 pt-0 pb-20 text-center'>
        <LuLock className='text-3xl text-primary' aria-hidden='true' />
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
