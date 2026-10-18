import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', 'doc/**', 'web/dev-dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['web/**/*.{ts,tsx,js}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // The Mongo-era services are replaced in step 4 of doc/Plan.md (Postgres + Drizzle);
    // until then their `any` types are reported as warnings instead of failing CI.
    files: ['api/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' },
  },
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
