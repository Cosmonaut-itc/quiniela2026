import { buildJoinUrl, buildPersonalUrl } from "@/lib/share";

describe("share URL builders", () => {
  it("buildJoinUrl arma la ruta /q/:id/join/:token sobre la base web", () => {
    expect(buildJoinUrl("Q1", "jt")).toBe(
      "https://quiniela2026-production-b5aa.up.railway.app/q/Q1/join/jt",
    );
  });
  it("buildPersonalUrl arma la ruta /q/:id/me/:token sobre la base web", () => {
    expect(buildPersonalUrl("Q1", "mt")).toBe(
      "https://quiniela2026-production-b5aa.up.railway.app/q/Q1/me/mt",
    );
  });
});
