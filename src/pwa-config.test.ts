import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Estas pruebas blindan el contrato PWA de iOS. El manifest se inyecta como blob
// por ruta (ver pwaManifest.ts / ManifestSync), NO como archivo estático: un
// `start_url` estático "/" hacía que iOS cacheara ese manifest y abriera la PWA
// en la página de crear quiniela sin importar desde dónde se instalara.
// Además iOS necesita viewport-fit + meta tags apple para el standalone y el notch.
const root = resolve(import.meta.dirname, "..");
const indexHtml = readFileSync(resolve(root, "index.html"), "utf8");

describe("PWA manifest — inyección dinámica por ruta", () => {
  it("declara un <link rel=manifest> que ManifestSync reapunta a un blob", () => {
    expect(indexHtml).toMatch(/<link[^>]*rel="manifest"[^>]*>/);
  });

  it("NO sirve un manifest estático (iOS cachearía start_url='/' y abriría mal)", () => {
    // El href estático lo precarga/cachea iOS antes de que el JS lo cambie, así
    // que la PWA abría en "/". Sin archivo estático no hay a qué engancharse.
    expect(indexHtml).not.toContain("manifest.webmanifest");
  });
});

describe("index.html — iOS standalone head", () => {
  it("opts the viewport into the safe area via viewport-fit=cover", () => {
    // `[^>]` spans newlines, so this matches whether the tag is one line or not.
    expect(indexHtml).toMatch(
      /<meta[^>]*name="viewport"[^>]*viewport-fit=cover[^>]*>/,
    );
  });

  it("declares the app web-app-capable (iOS + generic)", () => {
    expect(indexHtml).toMatch(
      /name="apple-mobile-web-app-capable"\s+content="yes"/,
    );
    expect(indexHtml).toMatch(/name="mobile-web-app-capable"\s+content="yes"/);
  });

  it("sets a translucent status bar so the header bleeds under it", () => {
    expect(indexHtml).toMatch(/name="apple-mobile-web-app-status-bar-style"/);
  });
});
