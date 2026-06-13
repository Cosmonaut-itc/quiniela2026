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

    const out = await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: ["WC"] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ tournamentCode: "WC", homeName: "Alpha", awayName: "Beta", apiFixtureId: null, confirmed: false });
  });

  it("devuelve [] si codes está vacío", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "live1", tournamentCode: "WC" }));
    expect(await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: [] })).toEqual([]);
  });

  it("excluye partidos cuyo lineup ya está confirmado", async () => {
    const t = convexTest(schema, modules);
    const matchId = await t.run(async (ctx) => {
      const m = await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "live1", tournamentCode: "WC" });
      await ctx.db.insert("lineups", { matchId: m, tournamentCode: "WC", apiFixtureId: 9, fetchedAt: 0, confirmed: true, home: fullTeam("A"), away: fullTeam("B") });
      return m;
    });
    const out = await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: ["WC"] });
    expect(out.find((x) => x.matchId === matchId)).toBeUndefined();
  });
});
