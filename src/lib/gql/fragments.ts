import { gql } from 'graphql-request';

export const FRAGMENT_USER_INFO = gql`
  fragment UserInfo on User {
    login
    name
    avatarUrl
    url
  }
`;

export const FRAGMENT_PAGE_INFO = gql`
  fragment PageInfo on PageInfo {
    hasNextPage
    endCursor
  }
`;

export const FRAGMENT_FOLLOWER_FIELDS = gql`
  fragment FollowerFields on FollowerConnection {
    totalCount
    pageInfo {
      ...PageInfo
    }
    nodes {
      ...UserInfo
    }
  }
`;

export const FRAGMENT_FOLLOWING_FIELDS = gql`
  fragment FollowingFields on FollowingConnection {
    totalCount
    pageInfo {
      ...PageInfo
    }
    nodes {
      ...UserInfo
    }
  }
`;
