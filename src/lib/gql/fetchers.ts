import { query } from '@/lib/gql/client';
import {
  GET_USER_FOLLOWERS_LOGIN,
  GET_USER_FOLLOWING_LOGIN,
} from '@/lib/gql/queries';
import type {
  GetUserFollowersLoginQuery,
  GetUserFollowersLoginQueryVariables,
  GetUserFollowingLoginQuery,
  GetUserFollowingLoginQueryVariables,
} from '@/lib/gql/types';
import { FollowLogin } from '../types';

export const fetchAllFollowersLogin = async (
  variables: GetUserFollowersLoginQueryVariables
) => {
  const allFollowersLogin: FollowLogin = { nodes: [], totalCount: 0 };
  let hasNextPage = true;
  let currentCursor: string | null = null;

  while (hasNextPage) {
    const currentVariables = {
      ...variables,
      afterFollowers: currentCursor,
    } as GetUserFollowersLoginQueryVariables;

    // Fetch more data if the cursor is null
    const { data, error } = await query<
      GetUserFollowersLoginQuery,
      GetUserFollowersLoginQueryVariables
    >({
      query: GET_USER_FOLLOWERS_LOGIN,
      variables: currentVariables,
    });

    if (error) {
      console.error('Error fetching followers login:', error);
      throw new Error(error.message);
    }

    const nodes = data.user?.followers.nodes || [];
    allFollowersLogin.nodes = [...allFollowersLogin.nodes, ...nodes];
    allFollowersLogin.totalCount = data.user?.followers.totalCount || 0;

    hasNextPage = data.user?.followers.pageInfo?.hasNextPage || false;
    currentCursor = data.user?.followers.pageInfo?.endCursor || null;

    // Small delay between requests to be polite and avoid secondary rate limits
    if (hasNextPage) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return allFollowersLogin;
};

export const fetchAllFollowingLogin = async (
  variables: GetUserFollowingLoginQueryVariables
) => {
  const allFollowingLogin: FollowLogin = { nodes: [], totalCount: 0 };
  let hasNextPage = true;
  let currentCursor: string | null = null;

  while (hasNextPage) {
    const currentVariables = {
      ...variables,
      afterFollowing: currentCursor,
    } as GetUserFollowingLoginQueryVariables;

    // Fetch more data if the cursor is null
    const { data, error } = await query<
      GetUserFollowingLoginQuery,
      GetUserFollowingLoginQueryVariables
    >({
      query: GET_USER_FOLLOWING_LOGIN,
      variables: currentVariables,
    });

    if (error) {
      console.error('Error fetching following login:', error);
      throw new Error(error.message);
    }

    const nodes = data.user?.following.nodes || [];
    allFollowingLogin.nodes = [...allFollowingLogin.nodes, ...nodes];
    allFollowingLogin.totalCount = data.user?.following.totalCount || 0;

    hasNextPage = data.user?.following.pageInfo?.hasNextPage || false;
    currentCursor = data.user?.following.pageInfo?.endCursor || null;

    // Small delay between requests to be polite and avoid secondary rate limits
    if (hasNextPage) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return allFollowingLogin;
};
