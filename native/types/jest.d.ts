// Globals de jest (describe/it/expect/jest…) para que los archivos de test
// tipen bajo `tsc --noEmit` sin meter @types/jest en el `types` global del
// tsconfig (eso desactivaría la auto-inclusión de los demás @types). Esta
// referencia solo aplica al typecheck; en runtime los globals los inyecta jest.
//
// Los matchers de RNTL (toBeOnTheScreen, etc.) se tipan al importar desde
// "@testing-library/react-native" en cada test (augmenta expect vía su d.ts).
/// <reference types="jest" />
