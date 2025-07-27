import { gql } from '@apollo/client';
import {
  FRAGMENT_FOLLOWER_FIELDS,
  FRAGMENT_FOLLOWING_FIELDS,
  FRAGMENT_PAGE_INFO,
} from './fragments';

export const GET_USER_FOLLOWERS_LOGIN = gql`
  query GetUserFollowersLogin(
    $login: String!
    $firstFollowers: Int = 100
    $afterFollowers: String
  ) {
    user(login: $login) {
      followers(first: $firstFollowers, after: $afterFollowers) {
        totalCount
        pageInfo {
          ...PageInfo
        }
        nodes {
          login
        }
      }
    }
  }

  ${FRAGMENT_PAGE_INFO}
`;

export const GET_USER_FOLLOWING_LOGIN = gql`
  query GetUserFollowingLogin(
    $login: String!
    $firstFollowing: Int = 100
    $afterFollowing: String
  ) {
    user(login: $login) {
      following(first: $firstFollowing, after: $afterFollowing) {
        totalCount
        pageInfo {
          ...PageInfo
        }
        nodes {
          login
        }
      }
    }
  }

  ${FRAGMENT_PAGE_INFO}
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

  ${FRAGMENT_FOLLOWING_FIELDS}
`;
