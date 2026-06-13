// Harness de tests unitarios para la app Expo (SEN-25). Corre SIEMPRE con
// cwd = native/ (igual que expo/metro/tsc/lint) — el preset jest-expo carga la
// config de babel-preset-expo relativa a este directorio.
//
// Renderer (decisión deliberada): jest-expo 56.0.5 trae react-test-renderer@19.2.3
// (pin EXACTO, alineado a React 19.2.3) y peerea @react-native/jest-preset@^0.85
// (RN 0.85). `expo install` eligió RNTL 14, que renderiza sobre el paquete nuevo
// `test-renderer` y bajo jest-expo 56 NO conecta el árbol (render() devuelve un
// objeto sin queries y `screen` reporta "render function has not been called").
// Se fijó RNTL 13.3.3, que renderiza con react-test-renderer 19.2.3 (el mismo que
// ya provee jest-expo) y monta el árbol correctamente. Por eso react-test-renderer
// va como devDependency pineado a 19.2.3 (caret floataría a 19.2.7 y rompería el
// peer react@^19.2.7 vs react 19.2.3).
//
// Styling en jest: Uniwind compila `className` por el TRANSFORMER de metro, que
// jest NO usa (jest transpila con babel-preset-expo vía babel-jest y resuelve
// react-native al mock de jest-expo). Por eso `className` llega como prop
// desconocida y el mock de RN simplemente la ignora — es un no-op inofensivo.
// Esto está bien para esta suite: los tests asiertan texto/rol/testID, NUNCA
// estilos computados. No se mockea ni se transforma Uniwind: no hace falta.
module.exports = {
  preset: "jest-expo",
  // Defensive: scope discovery to native/ only, never scan sibling repo folders.
  roots: ["<rootDir>"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  // react-native-reanimated 4 corre sobre react-native-worklets, cuyo módulo
  // resuelve por defecto su variante `.native` (binding JSI no inicializado en
  // jest => WorkletsError). El resolver documentado de worklets elimina la
  // extensión `.native` para esos imports y deja resolver la impl mockeable.
  // (https://docs.swmansion.com/react-native-worklets/docs/guides/testing)
  resolver: "react-native-worklets/jest/resolver",
  // Base = patrón recomendado por jest-expo, extendido con los módulos ESM/Flow
  // que renderizan los componentes de esta app (heroui-native, uniwind,
  // reanimated, gesture-handler, lucide, worklets, tailwind-*). Sin esto, jest
  // explota al toparse con su `export`/sintaxis no transpilada en node_modules.
  transformIgnorePatterns: [
    "/node_modules/(?!(?:.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|heroui-native|uniwind|react-native-reanimated|react-native-gesture-handler|react-native-worklets|lucide-react-native|tailwind-variants|tailwind-merge))",
    "/node_modules/react-native-reanimated/plugin/",
    "/node_modules/@react-native/babel-preset/",
  ],
};
