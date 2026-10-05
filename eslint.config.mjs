import js from '@eslint/js';
import globals from 'globals';

/**
 * Lint only the modular `src/` entry/shared/runtime seams.
 * The generated root `app.js` bundle and the legacy runtime monolith
 * (`src/runtime/legacy.js`) are intentionally excluded.
 */
export default [
  {
    ignores: [
      'app.js',
      'src/runtime/legacy.js',
      'node_modules/**',
      'www/**',
      '.pages-dist/**',
      'dist/**',
      'android/**',
      'desktop/**',
      'diagnostics/**',
      'worker/**',
      'scripts/**',
      'public/**',
      'assets/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
];
