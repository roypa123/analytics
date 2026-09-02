import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Part 0 §0.3.0 (Action A-09) — src/components/ui and the CLI-generated
    // src/hooks/use-mobile.ts are shadcn vendor code, regenerated wholesale
    // by `shadcn add`, and never hand-edited (Part 7 §7.10, Rule R-04).
    // These files trip several rules this eslint version enforces more
    // strictly than the generator's target (unused re-exports for Fast
    // Refresh, and `set-state-in-effect` in `use-mobile.ts`/`carousel.tsx`);
    // that is a property of the vendor code, not a signal about app code,
    // so it is scoped off here rather than hand-edited away.
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/hooks/use-mobile.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'react-refresh/only-export-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
