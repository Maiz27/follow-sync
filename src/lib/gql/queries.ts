import { gql } from 'graphql-request';
import {
  FRAGMENT_FOLLOWER_FIELDS,
  FRAGMENT_FOLLOWING_FIELDS,
  FRAGMENT_PAGE_INFO,
  FRAGMENT_USER_INFO,
} from './fragments';

export const GET_USER_FOLLOWERS_AND_FOLLOWING = gql`
  query GetUserFollowersAndFollowing(
    $login: String!
    $firstFollowers: Int = 100
    $afterFollowers: String
    $firstFollowing: Int = 100
    $afterFollowing: String
  ) {
    user(login: $login) {
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

export const GET_USER_FOLLOWERS = gql`
  query GetUserFollowers(
    $login: String!
    $firstFollowers: Int = 100
    $afterFollowers: String
  ) {
    user(login: $login) {
      followers(first: $firstFollowers, after: $afterFollowers) {
        ...FollowerFields
      }
    }
  }

  ${FRAGMENT_USER_INFO}
  ${FRAGMENT_PAGE_INFO}
  ${FRAGMENT_FOLLOWER_FIELDS}
`;

export const GET_USER_FOLLOWING = gql`
  query GetUserFollowing(
    $login: String!
    $firstFollowing: Int = 100
    $afterFollowing: String
  ) {
    user(login: $login) {
      following(first: $firstFollowing, after: $afterFollowing) {
        ...FollowingFields
      }
    }
  }

  ${FRAGMENT_USER_INFO}
  ${FRAGMENT_PAGE_INFO}
  ${FRAGMENT_FOLLOWING_FIELDS}
`;
