import { describe, it, expect } from "vitest";
import { normalizeTeamName } from "./apiFootball";
import {
  mapLiveFixtures, mapLineups, orientLineups, isConfirmed,
} from "./apiFootball";
import { matchLiveFixture } from "./apiFootball";
import { fetchLiveFixtures, fetchLineups, fetchFixturesByDate } from "./apiFootball";
import { vi } from "vitest";

describe("normalizeTeamName", () => {
  it("baja a minúsculas, quita acentos, puntuación y sufijos de club", () => {
    expect(normalizeTeamName("Atlético Madrid")).toBe("atletico madrid");
    expect(normalizeTeamName("Manchester City FC")).toBe("manchester city");
    expect(normalizeTeamName("A.F.C. Bournemouth")).toBe("bournemouth");
  });
  it("aplica alias curados", () => {
    expect(normalizeTeamName("Man City")).toBe("manchester city");
  });
  it("reconcilia el rebrand FIFA Turkey↔Türkiye (API-Football usa Türkiye)", () => {
    expect(normalizeTeamName("Türkiye")).toBe(normalizeTeamName("Turkey"));
  });
  it("reconcilia divergencias de nombre de selección WC entre semilla y API-Football", () => {
    // Confirmado contra la API el 2026-06-13: API-Football usa "USA" y "Bosnia &
    // Herzegovina"; nuestra semilla (football-data.org), "United States" y "Bosnia-Herzegovina".
    expect(normalizeTeamName("USA")).toBe(normalizeTeamName("United States"));
    expect(normalizeTeamName("Bosnia & Herzegovina")).toBe(normalizeTeamName("Bosnia-Herzegovina"));
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

describe("matchLiveFixture", () => {
  const fixtures = [
    { fixtureId: 10, homeApiId: 50, awayApiId: 42, homeName: "Manchester City FC", awayName: "Arsenal FC" },
    { fixtureId: 11, homeApiId: 1, awayApiId: 2, homeName: "Real Madrid", awayName: "Barcelona" },
  ];
  it("empareja por nombre normalizado de ambos equipos", () => {
    const f = matchLiveFixture({ homeName: "Man City", awayName: "Arsenal", apiFixtureId: null }, fixtures);
    expect(f?.fixtureId).toBe(10);
  });
  it("prefiere el apiFixtureId guardado (crosswalk auto-curado)", () => {
    const f = matchLiveFixture({ homeName: "x", awayName: "y", apiFixtureId: 11 }, fixtures);
    expect(f?.fixtureId).toBe(11);
  });
  it("devuelve null si no hay coincidencia", () => {
    expect(matchLiveFixture({ homeName: "Sevilla", awayName: "Betis", apiFixtureId: null }, fixtures)).toBeNull();
  });
  it("empareja aunque API-Football nombre a Turquía 'Türkiye' (nuestra semilla dice 'Turkey')", () => {
    // Caso real: fixture en vivo Australia vs Türkiye; nuestro partido es Australia vs Turkey.
    const wc = [{ fixtureId: 1539001, homeApiId: 779, awayApiId: 803, homeName: "Australia", awayName: "Türkiye" }];
    const f = matchLiveFixture({ homeName: "Australia", awayName: "Turkey", apiFixtureId: null }, wc);
    expect(f?.fixtureId).toBe(1539001);
  });
});

function fakeRes(opts: { status: number; retryAfter?: string | null; body?: unknown }) {
  return {
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    headers: { get: (h: string) => (h === "Retry-After" ? opts.retryAfter ?? null : null) },
    json: async () => opts.body ?? { response: [] },
  } as unknown as Response;
}

describe("fetchLiveFixtures / fetchLineups", () => {
  it("manda el header x-apisports-key y mapea la respuesta", async () => {
    const fetchFn = vi.fn(async () => fakeRes({ status: 200, body: {
      response: [{ fixture: { id: 7 }, teams: { home: { id: 1, name: "A" }, away: { id: 2, name: "B" } } }],
    } }));
    const out = await fetchLiveFixtures("KEY", { fetchFn });
    expect(out[0].fixtureId).toBe(7);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/fixtures?live=all");
    expect((init as RequestInit).headers).toMatchObject({ "x-apisports-key": "KEY" });
  });

  it("reintenta una vez tras 429 respetando Retry-After", async () => {
    const sleep = vi.fn(async () => {});
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(fakeRes({ status: 429, retryAfter: "1" }))
      .mockResolvedValueOnce(fakeRes({ status: 200, body: { response: [] } }));
    await fetchLineups("KEY", 7, { fetchFn, sleep });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("lanza si la respuesta no es ok", async () => {
    const fetchFn = vi.fn(async () => fakeRes({ status: 500 }));
    await expect(fetchLineups("KEY", 7, { fetchFn })).rejects.toThrow("api-football 500");
  });
});

describe("fetchFixturesByDate", () => {
  it("pega a /fixtures?date=YYYY-MM-DD y mapea como los fixtures en vivo", async () => {
    const fetchFn = vi.fn(async () => fakeRes({ status: 200, body: {
      response: [{ fixture: { id: 99 }, teams: { home: { id: 3, name: "Haiti" }, away: { id: 4, name: "Scotland" } } }],
    } }));
    const out = await fetchFixturesByDate("KEY", "2026-06-13", { fetchFn });
    expect(out).toEqual([{ fixtureId: 99, homeApiId: 3, awayApiId: 4, homeName: "Haiti", awayName: "Scotland" }]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/fixtures?date=2026-06-13");
    expect((init as RequestInit).headers).toMatchObject({ "x-apisports-key": "KEY" });
  });
});
