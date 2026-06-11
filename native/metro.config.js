const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
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

// Uniwind: compila global.css (Tailwind v4 vía @tailwindcss/node) en el
// pipeline de Metro. Invariantes del wrapper (verificados en uniwind 1.9.0):
// - DEBE ser el wrapper MÁS EXTERNO: pisa transformerPath sin encadenar,
//   reemplaza cacheStores por un FileStore en os.tmpdir()/metro-cache y parchea
//   Graph.prototype.traverseDependencies (recompila el CSS sin invalidar caché).
// - Hace spread de config/resolver — preserva los watchFolders/nodeModulesPaths
//   de arriba — y SÍ encadena nuestro resolveRequest si algún día definimos uno.
// - Su resolver redirige los imports de react-native a uniwind/components/*
//   (primitivos con className) en TODO origen — app y node_modules de terceros
//   incluidos; solo exime los internos de uniwind y del core de react-native.
//   Por eso ya no hay wrappers ni guard de eslint, y por eso los componentes de
//   librerías (p. ej. heroui-native) también reciben className.
// - cssEntryFile/dtsFile van RELATIVOS a process.cwd() (no a projectRoot):
//   correr expo/metro con cwd ≠ native/ hace que el entry de CSS nunca matchee
//   y el bundle salga SIN ESTILOS, sin error. Todo comando expo/metro va con
//   cwd = native/.
// - El d.ts se regenera en cada build de metro o con
//   `npx uniwind generate-artifacts --css ./global.css` (el --css es
//   obligatorio; --dts default uniwind-types.d.ts) y vive gitignored como
//   expo-env.d.ts. En un clon fresco, tsc falla con un TS2769 confuso
//   (className no existe) hasta generarlo.
// - polyfills.rem: 16 ya es el default de uniwind; explícito para blindar la
//   paridad con la web (rem del navegador = 16px; --radius 13.6, --spacing 4,
//   text-base 16).
// Deps: ya no hace falta el override de lightningcss que pedía react-native-css
// (uniwind pinea su propia lightningcss 1.30.1 como dependencia anidada).
// tailwindcss y uniwind van con pin EXACTO en package.json: el compilador de
// uniwind exige tailwindcss 4.3.0 exacto vía @tailwindcss/node — un caret que
// flotara tailwindcss divergiría el CSS fuente del compilador que lo parsea.
// Subir ambos en lockstep.
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./global.css",
  dtsFile: "./uniwind-types.d.ts",
  polyfills: { rem: 16 },
});
