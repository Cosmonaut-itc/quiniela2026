// https://docs.expo.dev/guides/using-eslint/
// Config propia de la app Expo (el eslint.config.js de la raíz ignora native/**).
// Creada a mano: expo lint no la bootstrapea porque encuentra la config de la
// raíz del monorepo al buscar en directorios padre.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
]);
