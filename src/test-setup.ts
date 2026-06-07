// Vitest global setup.
//
// This file runs for EVERY test file, including the Convex suites that opt into
// the `edge-runtime` environment via a `// @vitest-environment edge-runtime`
// pragma. `@testing-library/jest-dom` extends `expect` with DOM matchers and
// assumes a browser-like environment, so importing it unconditionally would
// blow up under edge-runtime (no `document`). We only load it when a DOM is
// actually present (i.e. the jsdom-based frontend tests).
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom");

  // Node 26 exposes `localStorage` / `sessionStorage` as undefined getters in
  // globalThis (needs --localstorage-file to work). vitest's populateGlobal()
  // skips keys already present in the host global, so jsdom's Storage objects
  // never reach the test VM context. Fix: pull them from the internal jsdom
  // instance that vitest conveniently exposes as `global.jsdom`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsdomInst = (globalThis as any).jsdom;
  if (jsdomInst?.window?._localStorage !== undefined) {
    const win = jsdomInst.window;
    Object.defineProperty(globalThis, "localStorage", {
      get: () => win._localStorage,
      set: (v: unknown) => { win._localStorage = v; },
      configurable: true,
      enumerable: false,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      get: () => win._sessionStorage,
      set: (v: unknown) => { win._sessionStorage = v; },
      configurable: true,
      enumerable: false,
    });
  }
}
