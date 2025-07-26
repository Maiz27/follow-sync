import { gql } from '@apollo/client';
import {
  FRAGMENT_USER_INFO,
  FRAGMENT_FOLLOWER_FIELDS,
  FRAGMENT_FOLLOWING_FIELDS,
} from './fragments';

export const GET_USER_FOLLOWS = gql`
  query GetUserFollows(
    $login: String!
    $firstFollowers: Int = 10
    $afterFollowers: String
    $firstFollowing: Int = 10
    $afterFollowing: String
  ) {
    user(login: $login) {
      ...UserInfo

      followers(first: $firstFollowers, after: $afterFollowers) {
        ...FollowerFields
      }

      following(first: $firstFollowing, after: $afterFollowing) {
        ...FollowingFields
      }
    }
  }

  ${FRAGMENT_USER_INFO}
  ${FRAGMENT_FOLLOWER_FIELDS}
  ${FRAGMENT_FOLLOWING_FIELDS}
`;
