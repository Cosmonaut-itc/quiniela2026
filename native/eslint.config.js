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
  {
    rules: {
      // Guard del footgun de NativeWind: nativewind-env.d.ts declara className
      // en los props del módulo react-native, pero con
      // globalClassNamePolyfill: false (metro.config.js) un primitivo importado
      // de react-native typechecka y renderiza SIN estilos, silenciosamente.
      // Solo se bloquean los primitivos visuales que tienen wrapper en
      // react-native-css/components; Platform, StyleSheet, tipos, etc. siguen
      // siendo legítimos desde react-native.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: [
                'ActivityIndicator',
                'Button',
                'FlatList',
                'Image',
                'ImageBackground',
                'KeyboardAvoidingView',
                'Pressable',
                'ScrollView',
                'Switch',
                'Text',
                'TextInput',
                'TouchableHighlight',
                'TouchableOpacity',
                'View',
                'VirtualizedList',
              ],
              message:
                'className no estiliza en los primitivos de react-native (globalClassNamePolyfill: false). Importa el wrapper desde react-native-css/components.',
            },
          ],
        },
      ],
    },
  },
]);
