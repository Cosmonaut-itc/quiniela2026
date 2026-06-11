const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);
const repoRoot = path.resolve(__dirname, "..");

// La app importa ../convex (API generada) y ../shared (helpers puros).
// Invariantes de resolución:
// - NO añadir la raíz del repo a watchFolders: el convex/ de la raíz ganaría
//   la resolución jerárquica y se colarían dos copias del paquete convex.
//   Mantener la versión de convex en lockstep entre package.json raíz y native/.
// - experiments.onDemandFilesystem=false en app.json: con el default de SDK 56,
//   expo export descarta estos watchFolders y el bundle de producción no resuelve @convex.
// - nodeModulesPaths es fallback (no override): la resolución jerárquica ya encuentra
//   native/node_modules primero; este ajuste cubre el caso de módulos no hallados en la
//   jerarquía del archivo fuente (p. ej. archivos en ../convex o ../shared).
config.watchFolders = [path.join(repoRoot, "convex"), path.join(repoRoot, "shared")];
config.resolver.nodeModulesPaths = [path.join(__dirname, "node_modules")];

// NativeWind v5 (react-native-css): compila global.css en el pipeline de Metro.
// - inlineVariables: false — los tokens quedan como variables CSS en runtime,
//   igual que en la web (y evita romper PlatformColor si se usa en el futuro).
// - globalClassNamePolyfill: false — usamos los wrappers de
//   react-native-css/components en vez de parchear los primitivos de RN.
module.exports = withNativewind(config, {
  inlineVariables: false,
  globalClassNamePolyfill: false,
});
