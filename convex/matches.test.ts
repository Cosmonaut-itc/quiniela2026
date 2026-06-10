// convex/matches.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

// convex-test cannot auto-discover function modules under Vite; pass the
// module map explicitly (the documented edge-runtime pattern).
const modules = import.meta.glob("./**/*.*s");

describe("seed + recompute", () => {
  it("seeds 48 teams and 104 matches with group teams populated", async () => {
    const t = convexTest(schema, modules);
    const res = await t.mutation(internal.seed.seedFromSnapshot, {});
    expect(res.teams).toBe(48);
    expect(res.matches).toBe(104);
    const teams = await t.run((ctx) => ctx.db.query("teams").collect());
    expect(teams.every((x) => x.alive)).toBe(true);
  });

  it("upsertMatchResult records a group match score", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    // pick any group match, finish it
    const gm = await t.run((ctx) =>
      ctx.db.query("matches").withIndex("by_stage_kickoff", (q) => q.eq("stage", "group")).first());
    await t.mutation(internal.matches.upsertMatchResult, {
      tournamentCode: "WC",
      match: { externalId: gm!.externalId, stage: "group", group: gm!.group ?? null,
        matchday: null, homeExternalId: null, awayExternalId: null, kickoffAt: gm!.kickoffAt,
        homeScore: 2, awayScore: 0, status: "finished", bracketSlot: null },
    });
    const updated = await t.run((ctx) =>
      ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", gm!.externalId)).first());
    expect(updated!.homeScore).toBe(2);
    expect(updated!.status).toBe("finished");
    // passing null externalIds on an existing match must PRESERVE the seeded teams,
    // not overwrite them with null (the `?? existing?.homeTeamId` fallback in upsertMatchResult)
    expect(updated!.homeTeamId).toBe(gm!.homeTeamId);
    expect(updated!.awayTeamId).toBe(gm!.awayTeamId);
  });

  it("a knockout penalty draw eliminates the loser via explicit winnerExternalId", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    // pick a knockout match (TBD teams in the snapshot) and assign two real seeded teams
    const km = await t.run((ctx) =>
      ctx.db.query("matches").filter((q) => q.neq(q.field("stage"), "group")).first());
    const externalId = km!.externalId;
    // two real seeded teams: 758 (Uruguay) home, 759 (Germany) away
    await t.mutation(internal.matches.upsertMatchResult, {
      tournamentCode: "WC",
      match: { externalId, stage: km!.stage, group: null,
        matchday: null, homeExternalId: "758", awayExternalId: "759", kickoffAt: km!.kickoffAt,
        homeScore: null, awayScore: null, status: "scheduled",
        winnerExternalId: null, bracketSlot: km!.bracketSlot ?? null },
    });
    // finish it 1-1 but the away team wins on penalties (explicit winner)
    await t.mutation(internal.matches.upsertMatchResult, {
      tournamentCode: "WC",
      match: { externalId, stage: km!.stage, group: null,
        matchday: null, homeExternalId: "758", awayExternalId: "759", kickoffAt: km!.kickoffAt,
        homeScore: 1, awayScore: 1, status: "finished",
        winnerExternalId: "759", bracketSlot: km!.bracketSlot ?? null },
    });
    await t.mutation(internal.matches.recomputeTeamStates, { tournamentCode: "WC" });

    const loser = await t.run((ctx) =>
      ctx.db.query("teams").withIndex("by_externalId", (q) => q.eq("externalId", "758")).first());
    const winner = await t.run((ctx) =>
      ctx.db.query("teams").withIndex("by_externalId", (q) => q.eq("externalId", "759")).first());
    expect(loser!.alive).toBe(false); // eliminated despite the equal score
    expect(winner!.alive).toBe(true);

    const stored = await t.run((ctx) =>
      ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", externalId)).first());
    expect(stored!.winnerTeamId).toBe(winner!._id);
  });

  it("setMatchResultManual guarda un override por quiniela (no toca el partido global)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const km = await t.run((ctx) =>
      ctx.db.query("matches").filter((q) => q.neq(q.field("stage"), "group")).first());
    const externalId = km!.externalId;
    // assign two real seeded teams so the match has resolvable home/away
    await t.mutation(internal.matches.upsertMatchResult, {
      tournamentCode: "WC",
      match: { externalId, stage: km!.stage, group: null,
        matchday: null, homeExternalId: "758", awayExternalId: "759", kickoffAt: km!.kickoffAt,
        homeScore: null, awayScore: null, status: "scheduled",
        winnerExternalId: null, bracketSlot: km!.bracketSlot ?? null },
    });
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: q.adminToken, matchExternalId: externalId,
      homeScore: 1, awayScore: 1, finished: true, winnerExternalId: "759",
    });
    const winner = await t.run((ctx) =>
      ctx.db.query("teams").withIndex("by_externalId", (q) => q.eq("externalId", "759")).first());
    // el override de ESTA quiniela lleva el ganador explícito
    const ovr = await t.run((ctx) =>
      ctx.db.query("matchOverrides").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).first());
    expect(ovr!.winnerTeamId).toBe(winner!._id);
    expect(ovr!.status).toBe("finished");
    // el partido GLOBAL queda intacto (sigue la API)
    const stored = await t.run((ctx) =>
      ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", externalId)).first());
    expect(stored!.winnerTeamId ?? null).toBeNull();
    expect(stored!.status).toBe("scheduled");
  });
});

describe("multi-torneo", () => {
  it("upsertTeam crea el equipo en su torneo y es idempotente", async () => {
    const t = convexTest(schema, modules);
    const team = { externalId: "57", name: "Arsenal FC", code: "ARS", crest: "https://c/57.png" };
    await t.mutation(internal.matches.upsertTeam, { team, tournamentCode: "PL", format: "liga" });
    await t.mutation(internal.matches.upsertTeam, { team, tournamentCode: "PL", format: "liga" });
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("teams").collect();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tournamentCode: "PL", flag: "https://c/57.png", group: "", currentStage: "league", alive: true,
      });
    });
  });

  it("el mismo club en dos torneos produce dos filas", async () => {
    const t = convexTest(schema, modules);
    const team = { externalId: "86", name: "Real Madrid", code: "RMA", crest: "https://c/86.png" };
    await t.mutation(internal.matches.upsertTeam, { team, tournamentCode: "PD", format: "liga" });
    await t.mutation(internal.matches.upsertTeam, { team, tournamentCode: "CL", format: "eliminatorio" });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("teams").collect()).toHaveLength(2);
    });
  });

  it("upsertMatchResult resuelve equipos dentro del torneo y guarda matchday", async () => {
    const t = convexTest(schema, modules);
    for (const [code, ext] of [["PL", "57"], ["PL", "65"], ["PD", "57"]] as const) {
      await t.mutation(internal.matches.upsertTeam, {
        team: { externalId: ext, name: ext, code: ext, crest: "" }, tournamentCode: code, format: "liga",
      });
    }
    await t.mutation(internal.matches.upsertMatchResult, {
      tournamentCode: "PL",
      match: {
        externalId: "m1", stage: "league", group: null, matchday: 24,
        homeExternalId: "57", awayExternalId: "65", kickoffAt: 100,
        homeScore: null, awayScore: null, status: "scheduled",
        winnerExternalId: null, bracketSlot: null,
      },
    });
    await t.run(async (ctx) => {
      const [mt] = await ctx.db.query("matches").collect();
      expect(mt).toMatchObject({ tournamentCode: "PL", matchday: 24 });
      const home = await ctx.db.get(mt.homeTeamId!);
      expect(home?.tournamentCode).toBe("PL"); // no el Real Madrid de PD
    });
  });
});
