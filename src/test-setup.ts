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
}
