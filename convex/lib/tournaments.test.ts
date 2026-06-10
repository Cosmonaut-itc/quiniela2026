import { describe, expect, it } from "vitest";
import { TOURNAMENTS, tournamentByCode, allowedGameModes, tournamentCodeOf } from "./tournaments";

describe("catálogo de torneos", () => {
  it("incluye el Mundial con formato eliminatorio", () => {
    const wc = tournamentByCode("WC");
    expect(wc).toMatchObject({ code: "WC", format: "eliminatorio" });
  });

  it("las ligas solo admiten progol; los eliminatorios ambos modos", () => {
    expect(allowedGameModes("liga")).toEqual(["progol"]);
    expect(allowedGameModes("eliminatorio")).toEqual(["clasica", "progol"]);
  });

  it("todo torneo del catálogo tiene code, name, shortName y format válidos", () => {
    for (const t of TOURNAMENTS) {
      expect(t.code).toMatch(/^[A-Z0-9]{2,4}$/);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.shortName.length).toBeGreaterThan(0);
      expect(["eliminatorio", "liga"]).toContain(t.format);
    }
  });

  it("tournamentByCode devuelve undefined para códigos fuera del catálogo", () => {
    expect(tournamentByCode("XX")).toBeUndefined();
  });

  it("tournamentCodeOf normaliza filas legacy sin código a WC", () => {
    expect(tournamentCodeOf({})).toBe("WC");
    expect(tournamentCodeOf({ tournamentCode: "PL" })).toBe("PL");
  });
});
