import SignIn from '@/components/auth/signIn';
import { Heading } from '@/components/utils/Heading';
import { Section } from '@/components/utils/Section';
import { SubText } from '@/components/utils/SubText';

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
