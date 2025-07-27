import { query } from '@/lib/gql/client';
import { GET_USER_FOLLOWS } from '@/lib/gql/queries';
import type {
  GetUserFollowsQuery,
  GetUserFollowsQueryVariables,
} from '@/lib/gql/types';

export async function fetchFollows(variables: GetUserFollowsQueryVariables) {
  const { data, error } = await query<
    GetUserFollowsQuery,
    GetUserFollowsQueryVariables
  >({
    query: GET_USER_FOLLOWS,
    variables,
  });

  if (error) throw new Error(error.message);

  return data.user;
}
