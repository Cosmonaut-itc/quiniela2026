// convex/lib/view.test.ts
import { describe, it, expect } from "vitest";
import { prizeModeOf, prizeView, sortPlayerTeams, gameModeOf } from "./view";

describe("prizeModeOf", () => {
  it("treats a missing mode as fixed (legacy)", () => {
    expect(prizeModeOf({})).toBe("fixed");
    expect(prizeModeOf({ prizeMode: "fixed" })).toBe("fixed");
    expect(prizeModeOf({ prizeMode: "weird" })).toBe("fixed");
  });
  it("recognises per_person", () => {
    expect(prizeModeOf({ prizeMode: "per_person" })).toBe("per_person");
  });
});

describe("prizeView", () => {
  it("returns the fixed text and a null pool for fixed mode", () => {
    const p = prizeView({ prizeText: "$5,000" }, 3);
    expect(p).toEqual({
      mode: "fixed", text: "$5,000", entryFee: null, pool: null, contributors: 3,
    });
  });
  it("computes pool = entryFee * contributors for per_person", () => {
    const p = prizeView({ prizeText: "", prizeMode: "per_person", entryFee: 200 }, 7);
    expect(p).toEqual({
      mode: "per_person", text: "", entryFee: 200, pool: 1400, contributors: 7,
    });
  });
  it("per_person with zero contributors yields a zero pool", () => {
    const p = prizeView({ prizeText: "", prizeMode: "per_person", entryFee: 200 }, 0);
    expect(p.pool).toBe(0);
  });
});

describe("sortPlayerTeams", () => {
  const t = (name: string, group: string, alive: boolean) => ({
    team: { code: name.slice(0, 3).toUpperCase(), name, flag: "🏴", group },
    alive,
  });

  it("pone los equipos vivos antes que los eliminados", () => {
    const out = sortPlayerTeams([t("Brasil", "C", false), t("Argentina", "A", true)]);
    expect(out.map((x) => x.team.name)).toEqual(["Argentina", "Brasil"]);
  });

  it("entre vivos, ordena por grupo y luego por nombre", () => {
    const out = sortPlayerTeams([
      t("México", "A", true),
      t("Japón", "B", true),
      t("Canadá", "A", true),
    ]);
    expect(out.map((x) => x.team.name)).toEqual(["Canadá", "México", "Japón"]);
  });

  it("no muta el arreglo original", () => {
    const input = [t("Brasil", "C", false), t("Argentina", "A", true)];
    const copy = [...input];
    sortPlayerTeams(input);
    expect(input).toEqual(copy);
  });
});

describe("gameModeOf", () => {
  it("default a clasica cuando falta el campo (legacy)", () => {
    expect(gameModeOf({})).toBe("clasica");
  });
  it("respeta clasica y progol explícitos", () => {
    expect(gameModeOf({ gameMode: "clasica" })).toBe("clasica");
    expect(gameModeOf({ gameMode: "progol" })).toBe("progol");
  });
  it("trata un valor desconocido como clasica", () => {
    expect(gameModeOf({ gameMode: "otro" })).toBe("clasica");
  });
});
