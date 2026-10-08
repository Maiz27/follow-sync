import { gql } from 'graphql-request';

export const FOLLOW_USER = gql`
  mutation FollowUser($userId: ID!) {
    followUser(input: { userId: $userId }) {
      user {
        id
        login
      }
    }
  }
`;

export const UNFOLLOW_USER = gql`
  mutation UnfollowUser($userId: ID!) {
    unfollowUser(input: { userId: $userId }) {
      user {
        id
        login
      }
    }
  }
`;
