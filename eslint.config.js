import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        chrome: 'readonly',
        browser: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['lib/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        Image: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    ignores: [
      'node_modules/',
      'dist/',
      'xyq/jszip.min.js',
      'docs/archive/',
      '*.bak',
    ],
  },
];
