import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  { languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } }, rules: { '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unsafe-type-assertion': 'error', '@typescript-eslint/no-deprecated': 'off', '@typescript-eslint/require-await': 'off', '@typescript-eslint/no-confusing-void-expression': 'off', '@typescript-eslint/no-misused-promises': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } }
);
