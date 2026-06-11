const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);
const repoRoot = path.resolve(__dirname, "..");

// La app importa ../convex (API generada) y ../shared (helpers puros, lo
// importará el port de vistas).
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
// - inlineRem: 16 — la web renderiza rem a 16px (default del navegador) pero el
//   compilador de react-native-css inlinea rem en build-time con default 14;
//   sin esto, todo tamaño derivado de rem queda al 87.5% del de la web
//   (--radius 11.9 en vez de 13.6, --spacing 3.5 en vez de 4, text-base 14 en
//   vez de 16).
// - inlineVariables: false — los tokens quedan como variables CSS en runtime,
//   igual que en la web (y evita romper PlatformColor si se usa en el futuro).
// - globalClassNamePolyfill: false — usamos los wrappers de
//   react-native-css/components en vez de parchear los primitivos de RN.
// Invariante de deps: package.json pinea lightningcss a 1.30.1 vía overrides
// porque react-native-css 3.0.7 falla deserializando Specifier con lightningcss
// 1.32.0 (la versión exacta que exige @tailwindcss/node); re-evaluar el pin al
// subir react-native-css.
module.exports = withNativewind(config, {
  inlineRem: 16,
  inlineVariables: false,
  globalClassNamePolyfill: false,
});
