// https://docs.expo.dev/guides/using-eslint/
// Config propia de la app Expo (el eslint.config.js de la raíz ignora native/**).
// Creada a mano: expo lint no la bootstrapea porque encuentra la config de la
// raíz del monorepo al buscar en directorios padre.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    // Globals de jest para el harness de tests (SEN-25). eslint-config-expo no
    // los trae, así que los .js de jest (setup/config) disparan no-undef en
    // `jest`/`describe`/… Los .tsx de test ya están cubiertos (TS apaga
    // no-undef y tsc resuelve los globals vía types/jest.d.ts), pero esto blinda
    // `eslint .` (CI/CodeRabbit) además del `expo lint` por defecto.
    files: ['**/__tests__/**', 'jest.setup.js', 'jest.config.js'],
    languageOptions: {
      globals: { ...globals.jest, ...globals.node },
    },
  },
  {
    ignores: ['dist/*'],
  },
]);
