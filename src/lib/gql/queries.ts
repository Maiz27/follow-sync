import { gql } from 'graphql-request';
import {
  FRAGMENT_FOLLOWER_FIELDS,
  FRAGMENT_FOLLOWING_FIELDS,
  FRAGMENT_PAGE_INFO,
  FRAGMENT_USER_INFO,
} from './fragments';

/**
 * Reads the signed-in user's own network through `viewer`, which always
 * resolves to the token's account. Querying `user(login:)` with the login
 * captured in the session at sign-in breaks if the account is renamed later.
 */
export const GET_USER_FOLLOWERS_AND_FOLLOWING = gql`
  query GetUserFollowersAndFollowing(
    $firstFollowers: Int = 100
    $afterFollowers: String
    $firstFollowing: Int = 100
    $afterFollowing: String
  ) {
    viewer {
      login
      followers(first: $firstFollowers, after: $afterFollowers) {
        ...FollowerFields
      }
      following(first: $firstFollowing, after: $afterFollowing) {
        ...FollowingFields
      }
    }
  }

  ${FRAGMENT_USER_INFO}
  ${FRAGMENT_PAGE_INFO}
  ${FRAGMENT_FOLLOWER_FIELDS}
  ${FRAGMENT_FOLLOWING_FIELDS}
`;
