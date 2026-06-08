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
});
