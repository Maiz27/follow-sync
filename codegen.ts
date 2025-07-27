import 'dotenv/config';
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: [
    {
      'https://api.github.com/graphql': {
        headers: {
          // 1. A GitHub personal access token (with "repo" or "read:org" scope as needed)
          Authorization: `Bearer ${process.env.FS_GITHUB_TOKEN}`,
          // 2. Any string identifying your app or project
          'User-Agent': 'follow-sync-codegen',
        },
      },
    },
  ],
  documents: [
    'src/lib/gql/**/*.ts',
    'src/lib/gql/**/*.tsx',
    // if you have .graphql files, uncomment:
    // 'lib/gql/**/*.graphql',
  ],
  generates: {
    // you could generate back into lib/gql or a separate types folder
    'src/lib/gql/types.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typed-document-node', // ← this one wraps your types in DocumentNode<>
      ],
    },
  },
};

export default config;
