import GetStarted from '@/components/auth/getStarted';
import { Heading } from '@/components/utils/heading';
import { Section } from '@/components/utils/section';
import { SubText } from '@/components/utils/subText';

export default async function Home() {
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
    </>
  );
}
