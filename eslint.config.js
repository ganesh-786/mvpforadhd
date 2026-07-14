import js from '@eslint/js';
import globals from 'globals';

// Lints the root-level Vercel entry point only — client/ and server/ each
// have their own eslint.config.js scoped to their workspace.
export default [
  {
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
];
