import globals from 'globals';
import pluginJs from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import mozilla from 'eslint-plugin-mozilla';
import prettierConfig from 'eslint-config-prettier';
import json from 'eslint-plugin-json';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import jest from 'eslint-plugin-jest';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.browser, // Add browser globals
        messenger: 'readonly',
        browser: 'readonly',
      },
    },
    plugins: {
      prettier,
      mozilla,
      'no-unsanitized': noUnsanitized,
    },
    rules: {
      ...mozilla.configs.recommended.rules,
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
    },
  },
  {
    files: ['**/*.json'],
    ...json.configs['recommended'],
    plugins: {
      json,
    },
    rules: {
      'json/*': 'error',
    },
  },
  {
    files: ['**/tests/**/*.js'], // Match your test files
    plugins: {
      jest,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      ...jest.configs.recommended.rules,
    },
  },
  pluginJs.configs.recommended,
];
