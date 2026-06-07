import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// These tests guard the iOS standalone PWA contract. iOS does NOT apply the
// spec default `scope: "/"` — omitting it makes every in-app navigation break
// out into the modal Safari browser (and that breakout is the flaky, "tap it
// several times" navigation). It also needs viewport-fit + apple meta tags so
// the header can sit under the status bar instead of being clipped by it.
const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "public/manifest.webmanifest"), "utf8"),
);
const indexHtml = readFileSync(resolve(root, "index.html"), "utf8");

describe("PWA manifest — iOS standalone navigation", () => {
  it("declares an explicit '/' scope (iOS ignores the spec default)", () => {
    expect(manifest.scope).toBe("/");
  });

  it("stays in standalone display mode", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("links a manifest at runtime so the dynamic blob can rebind its href", () => {
    // syncManifestLink() reapunta este <link> a un manifest con start_url por
    // ruta; si desaparece, la PWA volvería a abrir siempre en "/".
    expect(indexHtml).toMatch(/<link[^>]*rel="manifest"[^>]*>/);
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
