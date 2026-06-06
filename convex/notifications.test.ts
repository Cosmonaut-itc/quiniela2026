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
    expect(list.items).toHaveLength(1);
    expect(list.unreadCount).toBe(1);
    await t.mutation(api.notifications.markRead, { personalToken });
    list = await t.query(api.notifications.listForParticipant, { personalToken });
    expect(list.unreadCount).toBe(0);
    expect(list.items[0].read).toBe(true);
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
