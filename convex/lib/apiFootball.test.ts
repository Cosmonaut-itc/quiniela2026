import { describe, it, expect } from "vitest";
import { normalizeTeamName } from "./apiFootball";
import {
  mapLiveFixtures, mapLineups, orientLineups, isConfirmed,
} from "./apiFootball";

describe("normalizeTeamName", () => {
  it("baja a minúsculas, quita acentos, puntuación y sufijos de club", () => {
    expect(normalizeTeamName("Atlético Madrid")).toBe("atletico madrid");
    expect(normalizeTeamName("Manchester City FC")).toBe("manchester city");
    expect(normalizeTeamName("A.F.C. Bournemouth")).toBe("bournemouth");
  });
  it("aplica alias curados", () => {
    expect(normalizeTeamName("Man City")).toBe("manchester city");
  });
});

describe("mapLiveFixtures", () => {
  it("extrae fixtureId, nombres e ids de ambos equipos", () => {
    const out = mapLiveFixtures({ response: [{
      fixture: { id: 215662 },
      teams: { home: { id: 50, name: "Manchester City" }, away: { id: 42, name: "Arsenal" } },
    }] });
    expect(out).toEqual([{ fixtureId: 215662, homeApiId: 50, awayApiId: 42, homeName: "Manchester City", awayName: "Arsenal" }]);
  });
  it("tolera response ausente", () => {
    expect(mapLiveFixtures({})).toEqual([]);
  });
});

describe("mapLineups", () => {
  it("mapea formación, DT, 11 y banca por equipo", () => {
    const out = mapLineups({ response: [
      { team: { id: 50, name: "Manchester City" }, formation: "4-3-3", coach: { name: "Guardiola" },
        startXI: [{ player: { name: "Ederson", number: 31, pos: "G", grid: "1:1" } }],
        substitutes: [{ player: { name: "Ortega", number: 18, pos: "G", grid: null } }] },
      { team: { id: 42, name: "Arsenal" }, formation: "4-3-3", coach: { name: "Arteta" }, startXI: [], substitutes: [] },
    ] });
    expect(out[0]).toEqual({
      apiTeamId: 50, name: "Manchester City", formation: "4-3-3", coach: "Guardiola",
      startXI: [{ name: "Ederson", number: 31, pos: "G", grid: "1:1" }],
      bench: [{ name: "Ortega", number: 18, pos: "G" }],
    });
    expect(out[1].startXI).toEqual([]);
  });
  it("tolera campos ausentes (lineup aún no publicado)", () => {
    const out = mapLineups({ response: [{ team: { id: 1, name: "X" } }] });
    expect(out[0]).toEqual({ apiTeamId: 1, name: "X", formation: "", coach: "", startXI: [], bench: [] });
  });
});

describe("orientLineups", () => {
  const teams = [
    { apiTeamId: 42, name: "Arsenal", formation: "4-3-3", coach: "Arteta", startXI: [{ name: "Raya" }], bench: [] },
    { apiTeamId: 50, name: "Man City", formation: "4-3-3", coach: "Pep", startXI: [{ name: "Ederson" }], bench: [] },
  ];
  it("asigna home/away según los ids del fixture, sin importar el orden", () => {
    const { home, away } = orientLineups(teams, { fixtureId: 1, homeApiId: 50, awayApiId: 42, homeName: "", awayName: "" });
    expect(home.name).toBe("Man City");
    expect(away.name).toBe("Arsenal");
    expect("apiTeamId" in home).toBe(false); // se descarta para almacenar
  });
  it("cae a orden de array si los ids no casan", () => {
    const { home, away } = orientLineups(teams, { fixtureId: 1, homeApiId: 999, awayApiId: 888, homeName: "", awayName: "" });
    expect(home.name).toBe("Arsenal");
    expect(away.name).toBe("Man City");
  });
});

describe("isConfirmed", () => {
  it("confirmado solo si ambos equipos tienen 11 inicial", () => {
    const full = { name: "", formation: "", coach: "", startXI: [{ name: "p" }], bench: [] };
    const empty = { name: "", formation: "", coach: "", startXI: [], bench: [] };
    expect(isConfirmed({ home: full, away: full })).toBe(true);
    expect(isConfirmed({ home: full, away: empty })).toBe(false);
  });
});
