// convex/lib/footballData.test.ts
import { describe, it, expect, vi } from "vitest";
import { mapMatches, retryAfterMs, fetchMatches } from "./footballData";

// Respuesta mínima estilo `fetch` para inyectar en fetchMatches.
function fakeRes(opts: {
  status: number;
  retryAfter?: string | null;
  body?: unknown;
}) {
  return {
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    headers: { get: (h: string) => (h === "Retry-After" ? opts.retryAfter ?? null : null) },
    json: async () => opts.body ?? { matches: [] },
  } as unknown as Response;
}

describe("mapMatches", () => {
  it("maps stage, group, status and scores", () => {
    const out = mapMatches({ matches: [{
      id: 101, stage: "GROUP_STAGE", group: "GROUP_C",
      utcDate: "2026-06-13T18:00:00Z", status: "FINISHED",
      homeTeam: { id: 764 }, awayTeam: { id: 770 },
      score: { winner: "HOME_TEAM", fullTime: { home: 2, away: 0 } },
    }] });
    expect(out[0]).toMatchObject({
      externalId: "101", stage: "group", group: "C", status: "finished",
      homeExternalId: "764", awayExternalId: "770", homeScore: 2, awayScore: 0,
      winnerExternalId: "764",
    });
    expect(out[0].kickoffAt).toBe(Date.parse("2026-06-13T18:00:00Z"));
  });
  it("marks knockout TBD teams as null", () => {
    const out = mapMatches({ matches: [{ id: 9, stage: "FINAL", utcDate: "2026-07-19T19:00:00Z", status: "SCHEDULED", homeTeam: { id: null }, awayTeam: { id: null }, score: { fullTime: {} } }] });
    expect(out[0].stage).toBe("final");
    expect(out[0].homeExternalId).toBeNull();
    expect(out[0].winnerExternalId).toBeNull();
  });
  it("uses score.winner so a penalty draw still names a winner", () => {
    const out = mapMatches({ matches: [{
      id: 555, stage: "LAST_16", utcDate: "2026-07-01T18:00:00Z", status: "FINISHED",
      homeTeam: { id: 1 }, awayTeam: { id: 2 },
      score: { winner: "AWAY_TEAM", duration: "PENALTY_SHOOTOUT", fullTime: { home: 1, away: 1 } },
    }] });
    expect(out[0].homeScore).toBe(1);
    expect(out[0].awayScore).toBe(1);
    expect(out[0].winnerExternalId).toBe("2"); // away wins on penalties
  });
  it("trata AWARDED como finalizado y conserva marcador/ganador", () => {
    const out = mapMatches({ matches: [{
      id: 201, stage: "GROUP_STAGE", group: "GROUP_A", utcDate: "2026-06-15T18:00:00Z",
      status: "AWARDED", homeTeam: { id: 1 }, awayTeam: { id: 2 },
      score: { winner: "HOME_TEAM", fullTime: { home: 3, away: 0 } },
    }] });
    expect(out[0].status).toBe("finished");
    expect(out[0].homeScore).toBe(3);
    expect(out[0].winnerExternalId).toBe("1");
  });

  it("trata CANCELLED como finalizado sin marcador (las guardas lo excluyen)", () => {
    const out = mapMatches({ matches: [{
      id: 202, stage: "GROUP_STAGE", group: "GROUP_B", utcDate: "2026-06-15T18:00:00Z",
      status: "CANCELLED", homeTeam: { id: 3 }, awayTeam: { id: 4 }, score: { fullTime: {} },
    }] });
    expect(out[0].status).toBe("finished");
    expect(out[0].homeScore).toBeNull();
    expect(out[0].awayScore).toBeNull();
    expect(out[0].winnerExternalId).toBeNull();
  });

  it("numbers bracket slots per stage, not by global match index", () => {
    const out = mapMatches({ matches: [
      { id: 1, stage: "GROUP_STAGE", group: "GROUP_A", utcDate: "2026-06-11T16:00:00Z", status: "SCHEDULED", homeTeam: { id: 10 }, awayTeam: { id: 11 }, score: { fullTime: {} } },
      { id: 2, stage: "LAST_32", utcDate: "2026-06-28T16:00:00Z", status: "SCHEDULED", homeTeam: { id: null }, awayTeam: { id: null }, score: { fullTime: {} } },
      { id: 3, stage: "LAST_32", utcDate: "2026-06-28T20:00:00Z", status: "SCHEDULED", homeTeam: { id: null }, awayTeam: { id: null }, score: { fullTime: {} } },
      { id: 4, stage: "FINAL", utcDate: "2026-07-19T19:00:00Z", status: "SCHEDULED", homeTeam: { id: null }, awayTeam: { id: null }, score: { fullTime: {} } },
    ] });
    expect(out[0].bracketSlot).toBeNull(); // group has no slot
    expect(out[1].bracketSlot).toBe("r32-1"); // per-stage 1-based, not global index 1
    expect(out[2].bracketSlot).toBe("r32-2"); // not global index 2
    expect(out[3].bracketSlot).toBe("final-1"); // first (and only) final, not global index 3
  });
});

describe("retryAfterMs", () => {
  it("usa los segundos del header (en ms)", () => {
    expect(retryAfterMs("30")).toBe(30_000);
  });
  it("topa la espera a 60s", () => {
    expect(retryAfterMs("120")).toBe(60_000);
  });
  it("cae a un backoff por defecto si el header falta o es inválido", () => {
    expect(retryAfterMs(null)).toBe(1_000);
    expect(retryAfterMs("abc")).toBe(1_000);
    expect(retryAfterMs("0")).toBe(1_000);
    expect(retryAfterMs("-5")).toBe(1_000);
  });
});

describe("fetchMatches — rate limit (429)", () => {
  const okBody = { matches: [{ id: 1, stage: "FINAL", utcDate: "2026-07-19T19:00:00Z", status: "SCHEDULED", homeTeam: { id: null }, awayTeam: { id: null }, score: { fullTime: {} } }] };

  it("camino feliz: una sola llamada", async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeRes({ status: 200, body: okBody }));
    const out = await fetchMatches("tok", { fetchFn, sleep: vi.fn() });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(out[0].stage).toBe("final");
  });

  it("ante 429 espera el Retry-After y reintenta una vez", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(fakeRes({ status: 429, retryAfter: "2" }))
      .mockResolvedValueOnce(fakeRes({ status: 200, body: okBody }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const out = await fetchMatches("tok", { fetchFn, sleep });
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(1);
  });

  it("si el 429 persiste tras el reintento, lanza", async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeRes({ status: 429, retryAfter: "1" }));
    await expect(fetchMatches("tok", { fetchFn, sleep: vi.fn() })).rejects.toThrow("football-data 429");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("otros errores (p. ej. 500/403) no reintentan", async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeRes({ status: 500 }));
    await expect(fetchMatches("tok", { fetchFn, sleep: vi.fn() })).rejects.toThrow("football-data 500");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
