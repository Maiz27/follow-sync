import { auth, signIn } from './auth';
import { query } from '@/lib/gql/client';
import { GET_USER_FOLLOWS } from '@/lib/gql/queries';

export default async function Home() {
  const session = await auth();
  const token = session?.accessToken;
  console.log(session);

  if (!token) {
    return (
      <>
        <p>Not signed in</p>
        <form
          action={async () => {
            'use server';
            await signIn('github');
          }}
        >
          <button type='submit'>Signin with GitHub</button>
        </form>
      </>
    );
  }

  const { data } = await query({
    query: GET_USER_FOLLOWS,
    variables: {
      login: 'maiz27',
    },
  });
  console.log(data);

  return (
    <>
      <form
        action={async () => {
          'use server';
          await signIn('github');
        }}
      >
        <button type='submit'>Signin with GitHub</button>
      </form>
    </>
  );
}
