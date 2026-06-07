// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { insertNotification } from "./notifications";

const modules = import.meta.glob("./**/*.*s");

async function quinielaWithPlayer() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seedFromSnapshot, {});
  const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4 });
  const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
  return { t, q, personalToken: a.personalToken };
}

type T = ReturnType<typeof convexTest>;
async function closedSolo(t: T, name: string) {
  const q = await t.mutation(api.quinielas.createQuiniela, { name, prizeText: "$1", numParticipants: 1 });
  await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: `${name}-p` });
  await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
  return q;
}
async function assignKnockout(t: T) {
  const km = await t.run((ctx) => ctx.db.query("matches").filter((q) => q.neq(q.field("stage"), "group")).first());
  await t.mutation(internal.matches.upsertMatchResult, {
    match: { externalId: km!.externalId, stage: km!.stage, group: null,
      homeExternalId: "758", awayExternalId: "759", kickoffAt: km!.kickoffAt,
      homeScore: null, awayScore: null, status: "scheduled", winnerExternalId: null, bracketSlot: km!.bracketSlot ?? null } });
  return km!.externalId;
}
const tokenOf = (t: T, quinielaId: string) =>
  t.run((ctx) => ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId as never)).first())
    .then((p) => p!.personalToken);

describe("lectura y marcado de avisos", () => {
  it("listForParticipant devuelve items y unreadCount; markRead los marca", async () => {
    const { t, q, personalToken } = await quinielaWithPlayer();
    // joinQuiniela aún no emite avisos (eso es Task 5); inserto uno directo para probar lectura.
    const me = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_personalToken", (x) => x.eq("personalToken", personalToken)).first());
    await t.run((ctx) => ctx.db.insert("notifications", {
      quinielaId: q.quinielaId, audience: "participant", participantId: me!._id,
      type: "test", title: "Hola", body: "Mundo", createdAt: Date.now(), dedupeKey: "k1",
    }));
    let list = await t.query(api.notifications.listForParticipant, { personalToken });
    // Desde Task 5, joinQuiniela emite teams_assigned; el test inserta uno adicional "test".
    expect(list.items.length).toBeGreaterThanOrEqual(1);
    expect(list.unreadCount).toBeGreaterThanOrEqual(1);
    await t.mutation(api.notifications.markRead, { personalToken });
    list = await t.query(api.notifications.listForParticipant, { personalToken });
    expect(list.unreadCount).toBe(0);
    expect(list.items.every((n) => n.read)).toBe(true);
  });

  it("listForAdmin devuelve solo los avisos de audiencia admin de esa quiniela", async () => {
    const { t, q, personalToken } = await quinielaWithPlayer();
    const me = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_personalToken", (x) => x.eq("personalToken", personalToken)).first());
    await t.run((ctx) => ctx.db.insert("notifications", {
      quinielaId: q.quinielaId, audience: "admin",
      type: "player_joined", title: "Nuevo", body: "x", createdAt: Date.now(), dedupeKey: "k2",
    }));
    await t.run((ctx) => ctx.db.insert("notifications", {
      quinielaId: q.quinielaId, audience: "participant", participantId: me!._id,
      type: "teams_assigned", title: "Equipos", body: "y", createdAt: Date.now(), dedupeKey: "k3",
    }));
    const list = await t.query(api.notifications.listForAdmin, { adminToken: q.adminToken });
    expect(list.items.some((n) => n.type === "player_joined")).toBe(true);
    expect(list.items.some((n) => n.type === "teams_assigned")).toBe(false);
  });

  it("insertNotification es idempotente por dedupeKey", async () => {
    const { t, q, personalToken } = await quinielaWithPlayer();
    const me = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_personalToken", (x) => x.eq("personalToken", personalToken)).first());
    const intent = {
      quinielaId: q.quinielaId as string, audience: "participant" as const, participantId: me!._id as string,
      type: "test", title: "T", body: "B", matchId: null, teamId: null, dedupeKey: "dup-1",
    };
    await t.run((ctx) => insertNotification(ctx, intent));
    await t.run((ctx) => insertNotification(ctx, intent));
    const rows = await t.run((ctx) =>
      ctx.db.query("notifications").withIndex("by_dedupe", (x) => x.eq("dedupeKey", "dup-1")).collect());
    expect(rows).toHaveLength(1);
  });

  it("listForParticipant lanza con token inválido", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    await expect(t.query(api.notifications.listForParticipant, { personalToken: "no-existe" })).rejects.toThrow();
  });
});

describe("detectFromSync (cron)", () => {
  it("AISLAMIENTO: un override que elimina en A genera team_eliminated solo en A, e idempotente", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const ext = await assignKnockout(t);
    const a = await closedSolo(t, "A"); const b = await closedSolo(t, "B");
    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: a.adminToken, matchExternalId: ext, homeScore: 1, awayScore: 0, finished: true }); // 759 fuera en A
    await t.mutation(internal.notifications.detectFromSync, {});
    const listA = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, a.quinielaId) });
    const listB = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, b.quinielaId) });
    expect(listA.items.some((n) => n.type === "team_eliminated")).toBe(true);
    expect(listB.items.some((n) => n.type === "team_eliminated")).toBe(false);
    const before = listA.items.length;
    await t.mutation(internal.notifications.detectFromSync, {});
    const listA2 = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, a.quinielaId) });
    expect(listA2.items.length).toBe(before); // no duplica
  });

  it("match_soon avisa al dueño cuando el kickoff cae en la ventana", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const ext = await assignKnockout(t);
    const a = await closedSolo(t, "A");
    const m = await t.run((ctx) => ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", ext)).first());
    await t.run((ctx) => ctx.db.patch(m!._id, { kickoffAt: Date.now() + 30 * 60_000, status: "scheduled" }));
    await t.mutation(internal.notifications.detectFromSync, {});
    const list = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, a.quinielaId) });
    expect(list.items.some((n) => n.type === "match_soon")).toBe(true);
  });

  it("champion_won al dueño del campeón derivado por quiniela", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const fm = await t.run((ctx) => ctx.db.query("matches").withIndex("by_stage_kickoff", (q) => q.eq("stage", "final")).first());
    await t.mutation(internal.matches.upsertMatchResult, {
      match: { externalId: fm!.externalId, stage: "final", group: null, homeExternalId: "758", awayExternalId: "759",
        kickoffAt: fm!.kickoffAt, homeScore: 1, awayScore: 0, status: "finished", winnerExternalId: "758", bracketSlot: fm!.bracketSlot ?? null } });
    const a = await closedSolo(t, "A");
    await t.mutation(internal.notifications.detectFromSync, {});
    const list = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, a.quinielaId) });
    expect(list.items.some((n) => n.type === "champion_won")).toBe(true);
  });

  it("tournament_started a todos cuando ya arrancó el primer partido", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const a = await closedSolo(t, "A");
    const first = await t.run((ctx) => ctx.db.query("matches").withIndex("by_kickoff").first());
    await t.run((ctx) => ctx.db.patch(first!._id, { kickoffAt: Date.now() - 60_000 }));
    await t.mutation(internal.notifications.detectFromSync, {});
    const list = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, a.quinielaId) });
    expect(list.items.some((n) => n.type === "tournament_started")).toBe(true);
  });
});

describe("eventos por acción", () => {
  it("joinQuiniela avisa al admin (player_joined) y al jugador (teams_assigned en on_join)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4 });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const adminList = await t.query(api.notifications.listForAdmin, { adminToken: q.adminToken });
    expect(adminList.items.some((n) => n.type === "player_joined")).toBe(true);
    const meList = await t.query(api.notifications.listForParticipant, { personalToken: a.personalToken });
    expect(meList.items.some((n) => n.type === "teams_assigned")).toBe(true);
  });

  it("ready_to_distribute cuando la quiniela se llena", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 1 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const adminList = await t.query(api.notifications.listForAdmin, { adminToken: q.adminToken });
    expect(adminList.items.some((n) => n.type === "ready_to_distribute")).toBe(true);
  });

  it("closeAndRedistribute avisa quiniela_closed a todos; on_reveal añade teams_assigned", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "F", prizeText: "$1", numParticipants: 4, assignMode: "on_reveal" });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    let meList = await t.query(api.notifications.listForParticipant, { personalToken: a.personalToken });
    expect(meList.items.some((n) => n.type === "teams_assigned")).toBe(false); // aún no recibe equipos
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    meList = await t.query(api.notifications.listForParticipant, { personalToken: a.personalToken });
    expect(meList.items.some((n) => n.type === "quiniela_closed")).toBe(true);
    expect(meList.items.some((n) => n.type === "teams_assigned")).toBe(true);
  });
});
