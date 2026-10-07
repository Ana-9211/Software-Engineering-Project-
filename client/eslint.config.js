import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, vi: 'readonly', describe: 'readonly', test: 'readonly', expect: 'readonly', beforeEach: 'readonly', afterEach: 'readonly' },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      // XSS rule from the architecture (6.4): raw HTML is never rendered
      'react/no-danger': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
