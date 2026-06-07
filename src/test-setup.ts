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

  // Node 26 ships a `localStorage` global that is non-functional in the test VM
  // (it needs --localstorage-file), and vitest's populateGlobal() won't overwrite
  // an already-present global, so jsdom's Storage never wins. When the current
  // localStorage is missing or fails a round-trip, install a tiny in-memory
  // Storage polyfill. Test-only and clearly a substitute, so it can't mask real
  // browser Storage bugs; version-independent (no jsdom internals).
  const storageBroken = (() => {
    try {
      if (typeof localStorage === "undefined" || localStorage === null) return true;
      localStorage.setItem("__probe__", "1");
      const ok = localStorage.getItem("__probe__") === "1";
      localStorage.removeItem("__probe__");
      return !ok;
    } catch {
      return true;
    }
  })();
  if (storageBroken) {
    const makeStorage = (): Storage => {
      const store = new Map<string, string>();
      return {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() { return store.size; },
      } as Storage;
    };
    Object.defineProperty(globalThis, "localStorage", { value: makeStorage(), configurable: true });
    Object.defineProperty(globalThis, "sessionStorage", { value: makeStorage(), configurable: true });
  }
}
