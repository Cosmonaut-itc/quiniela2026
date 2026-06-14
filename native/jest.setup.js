/**
 * Setup compartido del harness de tests (SEN-25). Se ejecuta tras inicializar el
 * entorno node de react-native (no jsdom), antes de cada archivo de test
 * (setupFilesAfterEnv en jest.config.js).
 *
 * REGLA: mocks MÍNIMOS. Solo lo que hace falta para que los componentes que ya
 * se renderizan en algún test monten en node/jsdom sin tocar APIs nativas. NO se
 * mockea nada que ningún test renderice todavía. Cada tarea posterior EXTIENDE
 * este archivo cuando su componente necesite un mock nuevo (p. ej. para
 * renderizar un Button de heroui-native puede hacer falta mockear módulos
 * nativos adicionales; añádelos aquí con un comentario del porqué).
 */

// react-native-reanimated 4: setUpTests() instala los stubs JS del binding
// nativo (worklets/UI thread). Es el setup documentado para v4 — NO el viejo
// require("react-native-reanimated/mock"), que en v4 inicializa worklets nativos
// y revienta. Lo exige cualquier árbol que monte componentes de heroui-native
// (animaciones internas) o el GestureHandlerRootView.
// (https://docs.swmansion.com/react-native-reanimated/docs/guides/testing)
require("react-native-reanimated").setUpTests();

// react-native-gesture-handler: jestSetup instala los stubs de sus handlers
// nativos. Necesario porque reanimated/heroui y el root layout usan gesture-handler.
require("react-native-gesture-handler/jestSetup");

// expo-secure-store: native/lib/storage.ts lee/escribe tokens en el Keychain.
// En jest no hay Keychain; se stubean las APIs async como no-op resolviendo
// null/undefined (mismo contrato de degradación que el módulo: sin token => null).
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

// expo-font useFonts: app/_layout.tsx y cualquier gating de fuentes esperan
// [fontsLoaded, error]; se reporta cargado para que el árbol no se quede en el
// estado de splash (return null) y los hijos rendericen.
jest.mock("expo-font", () => {
  const actual = jest.requireActual("expo-font");
  return {
    ...actual,
    useFonts: jest.fn(() => [true, null]),
    isLoaded: jest.fn(() => true),
  };
});

// expo-image-picker: usePhotoUpload (vía EditableAvatar en las vistas personales)
// importa este módulo. En jest no hay galería ni permisos nativos; se stubea para
// que el árbol monte. Por defecto el usuario "cancela" (canceled: true) y los
// permisos se conceden — los tests que ejercitan la subida sobre-escriben estos
// mocks con jest.mock local.
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
