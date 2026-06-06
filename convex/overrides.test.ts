// convex/overrides.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");
type T = ReturnType<typeof convexTest>;

/** Quiniela cerrada con 1 participante que termina dueño de los 48 equipos. */
async function closedSolo(t: T, name: string) {
  const q = await t.mutation(api.quinielas.createQuiniela, { name, prizeText: "$1", numParticipants: 1 });
  await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: `${name}-p` });
  await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
  return q;
}
/** Asigna 758/759 a un partido de eliminatoria global (scheduled) y devuelve su externalId. */
async function assignKnockout(t: T) {
  const km = await t.run((ctx) => ctx.db.query("matches").filter((q) => q.neq(q.field("stage"), "group")).first());
  await t.mutation(internal.matches.upsertMatchResult, {
    match: { externalId: km!.externalId, stage: km!.stage, group: null,
      homeExternalId: "758", awayExternalId: "759", kickoffAt: km!.kickoffAt,
      homeScore: null, awayScore: null, status: "scheduled", winnerExternalId: null, bracketSlot: km!.bracketSlot ?? null },
  });
  return km!.externalId;
}
const aliveCount = (t: T, joinToken: string) =>
  t.query(api.quinielas.getOverview, { joinToken }).then((o) => o.players[0].aliveCount);
const personalTokenOf = (t: T, quinielaId: string) =>
  t.run((ctx) => ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId as never)).first())
    .then((p) => p!.personalToken);
const teamByExt = (t: T, ext: string) =>
  t.run((ctx) => ctx.db.query("teams").withIndex("by_externalId", (q) => q.eq("externalId", ext)).first());

describe("overrides por quiniela", () => {
  it("AISLAMIENTO: corregir en A no cambia los vivos de B ni el estado global", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const ext = await assignKnockout(t);
    const a = await closedSolo(t, "A"); const b = await closedSolo(t, "B");

    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: a.adminToken, matchExternalId: ext, homeScore: 1, awayScore: 0, finished: true });

    expect(await aliveCount(t, a.joinToken)).toBe(47); // 759 eliminado en A
    expect(await aliveCount(t, b.joinToken)).toBe(48); // B intacto

    const t759 = await teamByExt(t, "759");
    expect(t759!.alive).toBe(true); // estado global de equipos sin tocar
    const gm = await t.run((ctx) => ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", ext)).first());
    expect(gm!.status).toBe("scheduled"); // fila global del partido sin tocar
    expect(gm!.homeScore ?? null).toBeNull();
  });

  it("SELECTOR KO: empate con winnerExternalId elimina al perdedor solo en A", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const ext = await assignKnockout(t);
    const a = await closedSolo(t, "A"); const b = await closedSolo(t, "B");

    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: a.adminToken, matchExternalId: ext, homeScore: 1, awayScore: 1, finished: true, winnerExternalId: "759" });

    expect(await aliveCount(t, a.joinToken)).toBe(47);
    expect(await aliveCount(t, b.joinToken)).toBe(48);
    const t758 = await teamByExt(t, "758");
    const personalA = await t.query(api.participants.getPersonalPanel, { personalToken: await personalTokenOf(t, a.quinielaId) });
    expect(personalA.teams.find((x) => x.team.code === t758!.code)!.alive).toBe(false); // el perdedor explícito está fuera en A
  });

  it("REVERT: clearMatchOverride devuelve A al resultado automático", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const ext = await assignKnockout(t);
    const a = await closedSolo(t, "A");

    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: a.adminToken, matchExternalId: ext, homeScore: 1, awayScore: 0, finished: true });
    expect(await aliveCount(t, a.joinToken)).toBe(47);

    await t.mutation(api.matches.clearMatchOverride, { adminToken: a.adminToken, matchExternalId: ext });
    expect(await aliveCount(t, a.joinToken)).toBe(48); // volvió al automático
  });

  it("CAMPEÓN POR QUINIELA: A corrige la final con otro ganador que la API", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const fm = await t.run((ctx) => ctx.db.query("matches").withIndex("by_stage_kickoff", (q) => q.eq("stage", "final")).first());
    const ext = fm!.externalId;
    // la API da la final ganada por 758
    await t.mutation(internal.matches.upsertMatchResult, {
      match: { externalId: ext, stage: "final", group: null, homeExternalId: "758", awayExternalId: "759",
        kickoffAt: fm!.kickoffAt, homeScore: 2, awayScore: 0, status: "finished", winnerExternalId: "758", bracketSlot: fm!.bracketSlot ?? null } });
    await t.mutation(internal.matches.recomputeTeamStates, {});
    const a = await closedSolo(t, "A"); const b = await closedSolo(t, "B");

    // A corrige la final: gana 759
    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: a.adminToken, matchExternalId: ext, homeScore: 1, awayScore: 2, finished: true, winnerExternalId: "759" });

    const ovA = await t.query(api.quinielas.getOverview, { joinToken: a.joinToken });
    const ovB = await t.query(api.quinielas.getOverview, { joinToken: b.joinToken });
    expect(ovA.quiniela.status).toBe("finished");
    expect(ovA.players[0].status).toBe("champion");
    expect(ovB.quiniela.status).toBe("finished"); // B sigue la API (también hay campeón)

    // la divergencia: A ve a 759 como campeón; el global (y B) sigue siendo 758
    const adminA = await t.query(api.quinielas.getAdmin, { adminToken: a.adminToken });
    const finalRowA = adminA.matches.find((mm) => mm.externalId === ext)!;
    expect(finalRowA.winnerExternalId).toBe("759");
    expect(finalRowA.manualOverride).toBe(true);
    const t758 = await teamByExt(t, "758");
    const gm = await t.run((ctx) => ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", ext)).first());
    expect(gm!.winnerTeamId).toBe(t758!._id); // la final global sigue ganada por 758
  });
});
