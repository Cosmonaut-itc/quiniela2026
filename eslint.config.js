import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Generated Convex code and static data snapshots are not hand-written.
  // La app Expo en native/ trae su propio lint (expo lint); este config solo cubre la web.
  globalIgnores(['dist', 'convex/_generated/**', 'convex/data/**', 'native/**']),
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
  },
  {
    // Vendored shadcn/ui primitives intentionally export a component alongside
    // their `cva` variants constant, which react-refresh flags. This is the
    // canonical shadcn layout; do not split these files.
    files: ['src/components/ui/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
