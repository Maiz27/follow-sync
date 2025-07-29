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
    'src/lib/gql/types.ts': {
      plugins: [
        // ADD THIS BLOCK AT THE BEGINNING OF THE PLUGINS ARRAY
        {
          add: {
            content: '/* eslint-disable @typescript-eslint/no-explicit-any */',
          },
        },
        // END OF ADDED BLOCK
        'typescript',
        'typescript-operations',
        'typed-document-node', // ← this one wraps your types in DocumentNode<>
      ],
      // You can add specific configuration for the 'add' plugin here if needed,
      // but 'content' is usually sufficient.
      // e.g., config: { add: { content: '...', placement: 'prepend' } }
    },
  },
};

export default config;
