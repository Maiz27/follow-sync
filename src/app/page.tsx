import SignIn from '@/components/nav/signIn';
import { Heading } from '@/components-temp/utils/heading';
import { Section } from '@/components-temp/utils/section';
import { SubText } from '@/components-temp/utils/subText';

export default function Home() {
  return (
    <>
      <Section className='grid place-items-center'>
        <Heading Tag='h1'>
          {`Master Your GitHub Connections: Know Who's Really Following.`}
        </Heading>
        <SubText>
          {`Take control of your GitHub presence. Follow Sync provides a clear,
          real-time view of your followers and who you follow back, ensuring
          you're always in sync with your professional network.`}
        </SubText>

        <SignIn />
      </Section>
    </>
  );
}
