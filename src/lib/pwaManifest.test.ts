// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildManifest, syncManifestLink } from "./pwaManifest";

describe("buildManifest", () => {
  it("ancla start_url a la página de instalación", () => {
    const m = buildManifest("https://q.app", "/q/Q1/me/tok");
    expect(m.start_url).toBe("https://q.app/q/Q1/me/tok");
    expect(m.display).toBe("standalone");
  });

  it("usa la raíz como start_url cuando se instala desde '/'", () => {
    expect(buildManifest("https://q.app", "/").start_url).toBe("https://q.app/");
  });

  it("mantiene id y scope estables aunque cambie la ruta (identidad de la PWA)", () => {
    const a = buildManifest("https://q.app", "/q/Q1/me/tok");
    const b = buildManifest("https://q.app", "/q/Q2/admin/zzz");
    expect(a.id).toBe("https://q.app/");
    expect(a.scope).toBe("https://q.app/");
    expect(a.id).toBe(b.id);
    expect(a.scope).toBe(b.scope);
    expect(a.start_url).not.toBe(b.start_url);
  });
});

describe("syncManifestLink", () => {
  beforeEach(() => {
    document.head.innerHTML =
      '<link rel="manifest" href="/manifest.webmanifest" />';
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("rebind el <link rel=manifest> a un blob con el start_url de la página", async () => {
    let captured: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      captured = b as Blob;
      return "blob:fake-1";
    });

    syncManifestLink(document, "https://q.app", "/q/Q1/me/tok");

    const link = document.querySelector('link[rel="manifest"]')!;
    expect(link.getAttribute("href")).toBe("blob:fake-1");
    expect(captured).toBeInstanceOf(Blob);
    const json = JSON.parse(await captured!.text());
    expect(json.start_url).toBe("https://q.app/q/Q1/me/tok");
    expect(json.scope).toBe("https://q.app/");
  });

  it("revoca el blob anterior al regenerar en cada navegación", () => {
    const urls = ["blob:one", "blob:two"];
    let i = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => urls[i++]);

    syncManifestLink(document, "https://q.app", "/a");
    syncManifestLink(document, "https://q.app", "/b");

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:one");
    expect(
      document.querySelector('link[rel="manifest"]')!.getAttribute("href"),
    ).toBe("blob:two");
  });

  it("no revoca el href estático inicial (no es un blob)", () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:one");
    syncManifestLink(document, "https://q.app", "/a");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("no lanza si la página no enlaza un manifest", () => {
    document.head.innerHTML = "";
    expect(() =>
      syncManifestLink(document, "https://q.app", "/"),
    ).not.toThrow();
  });
});
