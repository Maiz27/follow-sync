import GetStarted from '@/components/auth/getStarted';
import Stats from '@/components/dashboard/stats';
import { Heading } from '@/components/utils/heading';
import { Section } from '@/components/utils/section';
import { SubText } from '@/components/utils/subText';
import { STATS_DATA } from '@/lib/constants';

export default async function Home() {
  const dummyStats = [
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
        <Stats list={dummyStats} />
      </Section>
    </>
  );
}
