// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

describe("schema lineups", () => {
  it("guarda y lee una fila de lineup", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => {
      const matchId = await ctx.db.insert("matches", {
        stage: "group", kickoffAt: 0, status: "live", externalId: "m1", tournamentCode: "WC",
      });
      return ctx.db.insert("lineups", {
        matchId, tournamentCode: "WC", apiFixtureId: 7, fetchedAt: 0, confirmed: true,
        home: { name: "A", formation: "4-3-3", coach: "X", startXI: [{ name: "p", number: 1, pos: "G" }], bench: [] },
        away: { name: "B", formation: "4-4-2", coach: "Y", startXI: [], bench: [] },
      });
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.home.startXI[0].name).toBe("p");
    expect(row?.confirmed).toBe(true);
  });
});

const emptyTeam = { name: "", formation: "", coach: "", startXI: [], bench: [] };
const fullTeam = (name: string) => ({ name, formation: "4-3-3", coach: "C", startXI: [{ name: "p1" }], bench: [] });

describe("upsertLineup", () => {
  it("inserta y luego parchea la MISMA fila por matchId", async () => {
    const t = convexTest(schema, modules);
    const matchId = await t.run((ctx) =>
      ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "m1", tournamentCode: "WC" }));

    await t.mutation(internal.lineups.upsertLineup, {
      matchId, tournamentCode: "WC", apiFixtureId: 7, fetchedAt: 1,
      home: emptyTeam, away: emptyTeam, confirmed: false,
    });
    await t.mutation(internal.lineups.upsertLineup, {
      matchId, tournamentCode: "WC", apiFixtureId: 7, fetchedAt: 2,
      home: fullTeam("A"), away: fullTeam("B"), confirmed: true,
    });

    const rows = await t.run((ctx) =>
      ctx.db.query("lineups").withIndex("by_match", (q) => q.eq("matchId", matchId)).collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].confirmed).toBe(true);
    expect(rows[0].home.name).toBe("A");
  });
});

describe("liveMatchesNeedingLineup", () => {
  it("solo trae partidos en vivo de los torneos en `codes`, sin lineup confirmado", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const home = await ctx.db.insert("teams", { code: "AAA", name: "Alpha", flag: "🇦", group: "A", alive: true, currentStage: "group", externalId: "t1", tournamentCode: "WC" });
      const away = await ctx.db.insert("teams", { code: "BBB", name: "Beta", flag: "🇧", group: "A", alive: true, currentStage: "group", externalId: "t2", tournamentCode: "WC" });
      // en vivo del torneo activo, sin lineup → debe salir
      await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "live1", tournamentCode: "WC", homeTeamId: home, awayTeamId: away });
      // agendado → no sale
      await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "scheduled", externalId: "sched1", tournamentCode: "WC", homeTeamId: home, awayTeamId: away });
      // en vivo de torneo NO activo (no está en codes) → no sale
      await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "pl1", tournamentCode: "PL", homeTeamId: home, awayTeamId: away });
    });

    const out = await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: ["WC"], now: 0 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ tournamentCode: "WC", homeName: "Alpha", awayName: "Beta", apiFixtureId: null, confirmed: false });
  });

  it("devuelve [] si codes está vacío", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "live1", tournamentCode: "WC" }));
    expect(await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: [], now: 0 })).toEqual([]);
  });

  it("excluye partidos cuyo lineup ya está confirmado", async () => {
    const t = convexTest(schema, modules);
    const matchId = await t.run(async (ctx) => {
      const m = await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "live1", tournamentCode: "WC" });
      await ctx.db.insert("lineups", { matchId: m, tournamentCode: "WC", apiFixtureId: 9, fetchedAt: 0, confirmed: true, home: fullTeam("A"), away: fullTeam("B") });
      return m;
    });
    const out = await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: ["WC"], now: 0 });
    expect(out.find((x) => x.matchId === matchId)).toBeUndefined();
  });
});

const NOW = 1_700_000_000_000;
const MIN = 60_000;

describe("liveMatchesNeedingLineup — ventana pre-partido (10 min antes)", () => {
  it("trae el partido agendado que arranca en ≤10 min, como fase 'pre' con su fecha UTC", async () => {
    const t = convexTest(schema, modules);
    const kickoffAt = NOW + 5 * MIN;
    await t.run(async (ctx) => {
      const home = await ctx.db.insert("teams", { code: "AAA", name: "Alpha", flag: "🇦", group: "A", alive: true, currentStage: "group", externalId: "t1", tournamentCode: "WC" });
      const away = await ctx.db.insert("teams", { code: "BBB", name: "Beta", flag: "🇧", group: "A", alive: true, currentStage: "group", externalId: "t2", tournamentCode: "WC" });
      await ctx.db.insert("matches", { stage: "group", kickoffAt, status: "scheduled", externalId: "pre1", tournamentCode: "WC", homeTeamId: home, awayTeamId: away });
    });
    const out = await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: ["WC"], now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      phase: "pre", homeName: "Alpha", awayName: "Beta",
      kickoffDate: new Date(kickoffAt).toISOString().slice(0, 10),
    });
  });

  it("NO trae el agendado que arranca en >10 min", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("matches", { stage: "group", kickoffAt: NOW + 30 * MIN, status: "scheduled", externalId: "pre2", tournamentCode: "WC" }));
    const out = await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: ["WC"], now: NOW });
    expect(out).toEqual([]);
  });

  it("NO trae el agendado en ventana si YA tiene una fila de lineup (una sola vez)", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const m = await ctx.db.insert("matches", { stage: "group", kickoffAt: NOW + 3 * MIN, status: "scheduled", externalId: "pre3", tournamentCode: "WC" });
      await ctx.db.insert("lineups", { matchId: m, tournamentCode: "WC", apiFixtureId: 5, fetchedAt: 0, confirmed: false, home: emptyTeam, away: emptyTeam });
    });
    const out = await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: ["WC"], now: NOW });
    expect(out).toEqual([]);
  });

  it("el partido en vivo sale con fase 'live' y kickoffDate null", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("matches", { stage: "group", kickoffAt: NOW, status: "live", externalId: "live2", tournamentCode: "WC" }));
    const out = await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: ["WC"], now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ phase: "live", kickoffDate: null });
  });
});

import { api } from "./_generated/api";
import { runLineupSync } from "./lineups";
import { vi } from "vitest";

const fx = (id: number, h: string, a: string) => ({ fixtureId: id, homeApiId: id * 10, awayApiId: id * 10 + 1, homeName: h, awayName: a });
const teamLineup = (apiTeamId: number, name: string, xi: number) => ({
  apiTeamId, name, formation: "4-3-3", coach: "C",
  startXI: Array.from({ length: xi }, (_, i) => ({ name: `p${i}` })), bench: [],
});

describe("runLineupSync", () => {
  it("sin partidos en vivo no hace NINGUNA llamada", async () => {
    const fetchLive = vi.fn();
    const fetchOne = vi.fn();
    const upsert = vi.fn();
    await runLineupSync([], { fetchLive, fetchOne, upsert });
    expect(fetchLive).not.toHaveBeenCalled();
    expect(fetchOne).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("una sola llamada live=all y un upsert por partido reconciliado", async () => {
    const fetchLive = vi.fn(async () => [fx(1, "Alpha", "Beta")]);
    const fetchOne = vi.fn(async () => [teamLineup(11, "Beta", 11), teamLineup(10, "Alpha", 11)]);
    const upsert = vi.fn(async () => {});
    await runLineupSync(
      [{ matchId: "m1", tournamentCode: "WC", homeName: "Alpha", awayName: "Beta", apiFixtureId: null, confirmed: false }],
      { fetchLive, fetchOne, upsert },
    );
    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(fetchOne).toHaveBeenCalledWith(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg).toMatchObject({ matchId: "m1", apiFixtureId: 1, confirmed: true });
    expect(arg.home.name).toBe("Alpha"); // orientado por id del fixture
  });

  it("salta el partido sin fixture reconciliado (no llama a fetchOne)", async () => {
    const fetchLive = vi.fn(async () => [fx(1, "Otro", "Equipo")]);
    const fetchOne = vi.fn();
    const upsert = vi.fn();
    await runLineupSync(
      [{ matchId: "m1", tournamentCode: "WC", homeName: "Alpha", awayName: "Beta", apiFixtureId: null, confirmed: false }],
      { fetchLive, fetchOne, upsert },
    );
    expect(fetchOne).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("fase 'pre': descubre el fixture por FECHA (no usa live=all) y hace upsert", async () => {
    const fetchLive = vi.fn();
    const fetchByDate = vi.fn(async () => [fx(99, "Haiti", "Scotland")]);
    const fetchOne = vi.fn(async () => [teamLineup(990, "Haiti", 11), teamLineup(991, "Scotland", 11)]);
    const upsert = vi.fn(async () => {});
    await runLineupSync(
      [{ matchId: "p1", tournamentCode: "WC", homeName: "Haiti", awayName: "Scotland", apiFixtureId: null, confirmed: false, phase: "pre", kickoffDate: "2026-06-13" }],
      { fetchLive, fetchByDate, fetchOne, upsert },
    );
    expect(fetchLive).not.toHaveBeenCalled(); // un agendado no aparece en live=all
    expect(fetchByDate).toHaveBeenCalledWith("2026-06-13");
    expect(fetchOne).toHaveBeenCalledWith(99);
    expect(upsert.mock.calls[0][0]).toMatchObject({ matchId: "p1", apiFixtureId: 99, confirmed: true });
  });

  it("mezcla 'live' + 'pre': pega a live=all y a la fecha, y upserta ambos", async () => {
    const fetchLive = vi.fn(async () => [fx(1, "Alpha", "Beta")]);
    const fetchByDate = vi.fn(async () => [fx(2, "Haiti", "Scotland")]);
    const fetchOne = vi.fn(async (id: number) =>
      id === 1 ? [teamLineup(10, "Alpha", 11), teamLineup(11, "Beta", 11)] : [teamLineup(20, "Haiti", 11), teamLineup(21, "Scotland", 11)]);
    const upsert = vi.fn(async () => {});
    await runLineupSync(
      [
        { matchId: "m1", tournamentCode: "WC", homeName: "Alpha", awayName: "Beta", apiFixtureId: null, confirmed: false, phase: "live", kickoffDate: null },
        { matchId: "p1", tournamentCode: "WC", homeName: "Haiti", awayName: "Scotland", apiFixtureId: null, confirmed: false, phase: "pre", kickoffDate: "2026-06-13" },
      ],
      { fetchLive, fetchByDate, fetchOne, upsert },
    );
    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(fetchByDate).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls.map((c) => c[0].matchId).sort()).toEqual(["m1", "p1"]);
  });

  it("varios 'pre' de la MISMA fecha consultan esa fecha una sola vez", async () => {
    const fetchLive = vi.fn();
    const fetchByDate = vi.fn(async () => []);
    const fetchOne = vi.fn();
    const upsert = vi.fn();
    await runLineupSync(
      [
        { matchId: "p1", tournamentCode: "WC", homeName: "A", awayName: "B", apiFixtureId: null, confirmed: false, phase: "pre", kickoffDate: "2026-06-13" },
        { matchId: "p2", tournamentCode: "WC", homeName: "C", awayName: "D", apiFixtureId: null, confirmed: false, phase: "pre", kickoffDate: "2026-06-13" },
      ],
      { fetchLive, fetchByDate, fetchOne, upsert },
    );
    expect(fetchByDate).toHaveBeenCalledTimes(1);
  });

  it("un fallo en un partido no aborta el resto", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchLive = vi.fn(async () => [fx(1, "Alpha", "Beta"), fx(2, "Gamma", "Delta")]);
    const fetchOne = vi.fn(async (id: number) => {
      if (id === 1) throw new Error("boom");
      return [teamLineup(20, "Gamma", 11), teamLineup(21, "Delta", 11)];
    });
    const upsert = vi.fn(async () => {});
    await runLineupSync(
      [
        { matchId: "m1", tournamentCode: "WC", homeName: "Alpha", awayName: "Beta", apiFixtureId: null, confirmed: false },
        { matchId: "m2", tournamentCode: "WC", homeName: "Gamma", awayName: "Delta", apiFixtureId: null, confirmed: false },
      ],
      { fetchLive, fetchOne, upsert },
    );
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].matchId).toBe("m2");
    errorSpy.mockRestore();
  });
});

describe("getLiveLineups", () => {
  it("devuelve solo partidos en vivo del torneo de la quiniela, con su lineup", async () => {
    const t = convexTest(schema, modules);
    const quinielaId = await t.run(async (ctx) => {
      const home = await ctx.db.insert("teams", { code: "AAA", name: "Alpha", flag: "🇦", group: "A", alive: true, currentStage: "group", externalId: "t1", tournamentCode: "WC" });
      const away = await ctx.db.insert("teams", { code: "BBB", name: "Beta", flag: "🇧", group: "A", alive: true, currentStage: "group", externalId: "t2", tournamentCode: "WC" });
      const liveMatch = await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "live1", tournamentCode: "WC", homeTeamId: home, awayTeamId: away, homeScore: 1, awayScore: 0 });
      await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "scheduled", externalId: "sched1", tournamentCode: "WC", homeTeamId: home, awayTeamId: away });
      await ctx.db.insert("lineups", { matchId: liveMatch, tournamentCode: "WC", apiFixtureId: 7, fetchedAt: 0, confirmed: true,
        home: { name: "Alpha", formation: "4-3-3", coach: "Pep", startXI: [{ name: "Ederson", number: 31 }], bench: [{ name: "Ortega" }] },
        away: { name: "Beta", formation: "4-4-2", coach: "Arteta", startXI: [{ name: "Raya" }], bench: [] } });
      return ctx.db.insert("quinielas", { name: "q", prizeText: "", numParticipants: 1, slotSizes: [1], adminToken: "a", joinToken: "j", status: "open", createdAt: 0, tournamentCode: "WC" });
    });

    const data = await t.query(api.lineups.getLiveLineups, { quinielaId });
    expect(data.matches).toHaveLength(1);
    const m = data.matches[0];
    expect(m.home?.name).toBe("Alpha");
    expect(m.homeScore).toBe(1);
    expect(m.lineup?.home.startXI[0].name).toBe("Ederson");
    expect(m.lineup?.away.coach).toBe("Arteta");
  });

  it("matches vacío si no hay partidos en vivo", async () => {
    const t = convexTest(schema, modules);
    const quinielaId = await t.run((ctx) =>
      ctx.db.insert("quinielas", { name: "q", prizeText: "", numParticipants: 1, slotSizes: [1], adminToken: "a", joinToken: "j", status: "open", createdAt: 0, tournamentCode: "WC" }));
    const data = await t.query(api.lineups.getLiveLineups, { quinielaId });
    expect(data.matches).toEqual([]);
  });
});
