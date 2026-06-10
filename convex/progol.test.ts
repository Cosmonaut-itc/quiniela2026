// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

async function seededProgol() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  await t.mutation(internal.seed.seedFromSnapshot, {});
  const q = await t.mutation(api.quinielas.createQuiniela, {
    name: "P", prizeText: "$1", numParticipants: 10, gameMode: "progol",
  });
  return { t, q };
}
/** Un partido de grupo con ambos equipos y saque en el futuro. */
async function futureGroupMatch(t: Awaited<ReturnType<typeof seededProgol>>["t"]) {
  return await t.run(async (ctx) => {
    const ms = await ctx.db.query("matches").withIndex("by_stage_kickoff", (q) => q.eq("stage", "group")).collect();
    const m = ms.find((x) => x.homeTeamId && x.awayTeamId)!;
    await ctx.db.patch(m._id, { kickoffAt: Date.now() + 86_400_000, status: "scheduled" });
    return m._id;
  });
}

describe("progol.predict", () => {
  it("guarda y luego cambia el pronóstico (upsert)", async () => {
    const { t, q } = await seededProgol();
    const { personalToken } = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const matchId = await futureGroupMatch(t);
    await t.mutation(api.progol.predict, { personalToken, matchId, pick: "home" });
    let rows = await t.run((ctx) => ctx.db.query("predictions").withIndex("by_quiniela_match", (x) => x.eq("quinielaId", q.quinielaId).eq("matchId", matchId)).collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].pick).toBe("home");
    await t.mutation(api.progol.predict, { personalToken, matchId, pick: "draw" });
    rows = await t.run((ctx) => ctx.db.query("predictions").withIndex("by_quiniela_match", (x) => x.eq("quinielaId", q.quinielaId).eq("matchId", matchId)).collect());
    expect(rows).toHaveLength(1); // sigue siendo una sola fila
    expect(rows[0].pick).toBe("draw");
  });
  it("rechaza pronosticar un partido que ya empezó", async () => {
    const { t, q } = await seededProgol();
    const { personalToken } = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const matchId = await futureGroupMatch(t);
    await t.run((ctx) => ctx.db.patch(matchId, { kickoffAt: 1 })); // saque en el pasado
    await expect(t.mutation(api.progol.predict, { personalToken, matchId, pick: "home" })).rejects.toThrow();
  });
  it("rechaza un partido sin rivales definidos", async () => {
    const { t, q } = await seededProgol();
    const { personalToken } = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const blankId = await t.run(async (ctx) => {
      const ms = await ctx.db.query("matches").collect();
      return ms.find((m) => !m.homeTeamId || !m.awayTeamId)!._id;
    });
    await expect(t.mutation(api.progol.predict, { personalToken, matchId: blankId, pick: "home" })).rejects.toThrow();
  });
  it("rechaza un partido de otro torneo", async () => {
    const { t, q } = await seededProgol(); // quiniela WC
    const { personalToken } = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    // Sembrar un partido PL futuro con rivales definidos (pasaría los demás guards).
    await t.mutation(internal.matches.upsertTeam, {
      tournamentCode: "PL", format: "liga",
      team: { externalId: "PL-T1", name: "Arsenal", code: "ARS", crest: "" },
    });
    await t.mutation(internal.matches.upsertTeam, {
      tournamentCode: "PL", format: "liga",
      team: { externalId: "PL-T2", name: "Chelsea", code: "CHE", crest: "" },
    });
    await t.mutation(internal.matches.upsertMatchResult, {
      tournamentCode: "PL",
      match: {
        externalId: "PL-M1", stage: "league", group: null, matchday: 1,
        homeExternalId: "PL-T1", awayExternalId: "PL-T2",
        kickoffAt: Date.now() + 86_400_000, homeScore: null, awayScore: null,
        status: "scheduled", winnerExternalId: null, bracketSlot: null,
      },
    });
    const plMatchId = await t.run(async (ctx) => {
      const m = await ctx.db.query("matches").withIndex("by_externalId", (x) => x.eq("externalId", "PL-M1")).first();
      return m!._id;
    });
    await expect(t.mutation(api.progol.predict, { personalToken, matchId: plMatchId, pick: "home" }))
      .rejects.toThrow(/otro torneo/);
  });
});

describe("progol.getGeneral", () => {
  it("ordena el leaderboard por aciertos", async () => {
    const { t, q } = await seededProgol();
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const b = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Beto" });
    const matchId = await futureGroupMatch(t);
    await t.mutation(api.progol.predict, { personalToken: a.personalToken, matchId, pick: "home" });
    await t.mutation(api.progol.predict, { personalToken: b.personalToken, matchId, pick: "away" });
    await t.run((ctx) => ctx.db.patch(matchId, { status: "finished", homeScore: 2, awayScore: 0 }));
    const g = await t.query(api.progol.getGeneral, { joinToken: q.joinToken });
    expect(g.mode).toBe("progol");
    expect(g.decidedMatches).toBe(1);
    const ana = g.leaderboard.find((r) => r.name === "Ana")!;
    const beto = g.leaderboard.find((r) => r.name === "Beto")!;
    expect(ana.points).toBe(1);
    expect(beto.points).toBe(0);
    expect(ana.rank).toBe(1);
    expect(beto.rank).toBe(2);
  });
});

describe("progol.getPersonal / getCard", () => {
  it("expone el estado por partido, mi pick y el acierto", async () => {
    const { t, q } = await seededProgol();
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const matchId = await futureGroupMatch(t);
    await t.mutation(api.progol.predict, { personalToken: a.personalToken, matchId, pick: "home" });
    await t.run((ctx) => ctx.db.patch(matchId, { status: "finished", homeScore: 1, awayScore: 0 }));
    const card = await t.query(api.progol.getPersonal, { personalToken: a.personalToken });
    const mine = card.stages.flatMap((s) => s.matches).find((m) => m.matchId === matchId)!;
    expect(mine.state).toBe("finished");
    expect(mine.pick).toBe("home");
    expect(mine.result).toBe("home");
    expect(mine.correct).toBe(true);
    expect(card.who.points).toBe(1);
  });
  it("getCard muestra la tarjeta de otro jugador (read-only)", async () => {
    const { t, q } = await seededProgol();
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const matchId = await futureGroupMatch(t);
    await t.mutation(api.progol.predict, { personalToken: a.personalToken, matchId, pick: "draw" });
    const aId = await t.run(async (ctx) => {
      const ps = await ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect();
      return ps[0]._id;
    });
    const card = await t.query(api.progol.getCard, { joinToken: q.joinToken, participantId: aId });
    expect(card.who.name).toBe("Ana");
    const mine = card.stages.flatMap((s) => s.matches).find((m) => m.matchId === matchId)!;
    expect(mine.pick).toBe("draw");
  });
});

describe("progol.getAdmin / closeRegistration", () => {
  it("lista participantes con puntos y expone los 104 partidos", async () => {
    const { t, q } = await seededProgol();
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const admin = await t.query(api.progol.getAdmin, { adminToken: q.adminToken });
    expect(admin.participants).toHaveLength(1);
    expect(admin.participants[0].points).toBe(0);
    expect(admin.matches.length).toBe(104);
    expect(admin.quiniela.joinToken).toBe(q.joinToken);
  });
  it("closeRegistration cierra la inscripción", async () => {
    const { t, q } = await seededProgol();
    await t.mutation(api.progol.closeRegistration, { adminToken: q.adminToken });
    const qn = await t.run((ctx) => ctx.db.get(q.quinielaId));
    expect(qn!.status).toBe("locked");
  });
});

describe("autoCloseDue + detectFromSync (progol)", () => {
  it("autoCloseDue cierra la inscripción de progol al primer saque", async () => {
    const { t, q } = await seededProgol();
    const first = await t.run((ctx) => ctx.db.query("matches").withIndex("by_kickoff").first());
    await t.run((ctx) => ctx.db.patch(first!._id, { kickoffAt: 1 }));
    await t.mutation(internal.quinielas.autoCloseDue, {});
    const qn = await t.run((ctx) => ctx.db.get(q.quinielaId));
    expect(qn!.status).toBe("locked");
  });
  it("detectFromSync avisa partidos desbloqueados (una sola vez)", async () => {
    const { t, q } = await seededProgol();
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.run(async (ctx) => {
      const teams = await ctx.db.query("teams").take(2);
      const r32 = (await ctx.db.query("matches").collect()).find((m) => m.stage === "r32")!;
      await ctx.db.patch(r32._id, { homeTeamId: teams[0]._id, awayTeamId: teams[1]._id });
    });
    const meId = await t.run(async (ctx) => {
      const ps = await ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect();
      return ps[0]._id;
    });
    await t.mutation(internal.notifications.detectFromSync, {});
    let unlocked = await t.run((ctx) => ctx.db.query("notifications").withIndex("by_participant", (x) => x.eq("participantId", meId)).collect());
    expect(unlocked.filter((n) => n.type === "predictions_unlocked")).toHaveLength(1);
    await t.mutation(internal.notifications.detectFromSync, {});
    unlocked = await t.run((ctx) => ctx.db.query("notifications").withIndex("by_participant", (x) => x.eq("participantId", meId)).collect());
    expect(unlocked.filter((n) => n.type === "predictions_unlocked")).toHaveLength(1); // dedupe
  });
});
