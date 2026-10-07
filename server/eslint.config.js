const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.jest } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'error',
    },
  },
  { files: ['**/*.mjs'], languageOptions: { sourceType: 'module', globals: globals.node } },
  { files: ['scripts/**/*.js', 'src/adapters/mail/**/*.js'], rules: { 'no-console': 'off' } },
];
