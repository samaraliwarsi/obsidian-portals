import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';


export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // TypeScript source files (type‑aware) – include Obsidian rules here
  {
    files: ['src/**/*.ts'],
    plugins: { obsidianmd },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  },

  // Plain JavaScript / MJS files (no type information) – no Obsidian type‑aware rules
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },

  // Ignored files
  {
    ignores: ['main.js', '*.config.js', '*.mjs', 'node_modules/', '.git/'],
  },
];