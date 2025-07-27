export type textSizes =
  | 'xs'
  | 'sm'
  | 'base'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl'
  | '7xl';

export type FollowLogin = {
  totalCount: number;
  nodes: LoginNode[];
};

export type LoginNode = {
  login: string;
} | null;
