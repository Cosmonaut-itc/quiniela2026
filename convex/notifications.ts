import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { NotificationItem, NotificationsData } from "./types";
import { resolveQuiniela } from "./lib/perQuiniela";
import { detectSyncEvents, type NotifyIntent } from "./lib/notify";

const SOON_MS = 65 * 60_000;

/** Inserta un aviso si no existe ya uno con su dedupeKey (emite-una-vez). La UNICIDAD de un
 *  aviso la garantiza ESTE helper vía el índice by_dedupe (Convex no tiene índices únicos a
 *  nivel de schema), así que nunca insertes en "notifications" por fuera de aquí. Costura
 *  única: la Fase 2 añadirá el disparo de push tras insertar. */
export async function insertNotification(ctx: MutationCtx, intent: NotifyIntent): Promise<void> {
  const dupe = await ctx.db
    .query("notifications")
    .withIndex("by_dedupe", (q) => q.eq("dedupeKey", intent.dedupeKey))
    .first();
  if (dupe) return;
  await ctx.db.insert("notifications", {
    quinielaId: intent.quinielaId as Id<"quinielas">,
    audience: intent.audience,
    participantId: intent.participantId ? (intent.participantId as Id<"participants">) : undefined,
    type: intent.type,
    title: intent.title,
    body: intent.body,
    matchId: intent.matchId ? (intent.matchId as Id<"matches">) : undefined,
    teamId: intent.teamId ? (intent.teamId as Id<"teams">) : undefined,
    createdAt: Date.now(),
    dedupeKey: intent.dedupeKey,
  });
}

const toItem = (n: Doc<"notifications">): NotificationItem => ({
  id: n._id as string,
  type: n.type,
  title: n.title,
  body: n.body,
  createdAt: n.createdAt,
  read: n.readAt != null,
});

export const listForParticipant = query({
  args: { personalToken: v.string() },
  handler: async (ctx, args): Promise<NotificationsData> => {
    const me = await ctx.db
      .query("participants")
      .withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken))
      .first();
    if (!me) throw new Error("Jugador no encontrado");
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_participant", (q) => q.eq("participantId", me._id))
      .order("desc")
      .take(50);
    return {
      items: rows.map(toItem),
      unreadCount: rows.filter((r) => r.readAt == null).length,
    };
  },
});

export const listForAdmin = query({
  args: { adminToken: v.string() },
  handler: async (ctx, args): Promise<NotificationsData> => {
    const qn = await ctx.db
      .query("quinielas")
      .withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken))
      .first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_quiniela_audience", (q) =>
        q.eq("quinielaId", qn._id).eq("audience", "admin"),
      )
      .order("desc")
      .take(50);
    return {
      items: rows.map(toItem),
      unreadCount: rows.filter((r) => r.readAt == null).length,
    };
  },
});

export const markRead = mutation({
  args: {
    personalToken: v.optional(v.string()),
    adminToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let rows: Doc<"notifications">[];
    if (args.personalToken) {
      const me = await ctx.db
        .query("participants")
        .withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken!))
        .first();
      if (!me) throw new Error("Jugador no encontrado");
      rows = await ctx.db
        .query("notifications")
        .withIndex("by_participant", (q) => q.eq("participantId", me._id))
        .filter((q) => q.eq(q.field("readAt"), undefined)).collect();
    } else if (args.adminToken) {
      const qn = await ctx.db
        .query("quinielas")
        .withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken!))
        .first();
      if (!qn) throw new Error("Quiniela no encontrada");
      rows = await ctx.db
        .query("notifications")
        .withIndex("by_quiniela_audience", (q) =>
          q.eq("quinielaId", qn._id).eq("audience", "admin"),
        )
        .filter((q) => q.eq(q.field("readAt"), undefined)).collect();
    } else {
      throw new Error("Falta token");
    }
    for (const r of rows) await ctx.db.patch(r._id, { readAt: now });
    return { ok: true as const };
  },
});

/** Recorre las quinielas, deriva su estado efectivo (con overrides) e inserta los avisos
 *  por sincronización que falten. Se llama al final de syncMatches. */
export const detectFromSync = internalMutation({
  args: {},
  handler: async (ctx) => {
    const firstMatch = await ctx.db.query("matches").withIndex("by_kickoff").first();
    const now = Date.now();
    const tournamentStarted = !!firstMatch && now >= firstMatch.kickoffAt;
    const quinielas = await ctx.db.query("quinielas").collect();
    for (const qn of quinielas) {
      const ownerships = await ctx.db.query("ownerships")
        .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      if (ownerships.length === 0) continue; // sin equipos repartidos no hay nada que avisar
      const { teamById, effRows, states } = await resolveQuiniela(ctx, qn._id);
      const participants = await ctx.db.query("participants")
        .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      const teamLiteById = new Map(
        [...teamById].map(([id, tm]) => [id as string, { id: id as string, name: tm.name, flag: tm.flag }]));
      const ownerByTeam = new Map<string, string>(
        ownerships.map((o) => [o.teamId as string, o.participantId as string]));
      const teamCountByParticipant = new Map<string, number>();
      for (const o of ownerships) {
        const key = o.participantId as string;
        teamCountByParticipant.set(key, (teamCountByParticipant.get(key) ?? 0) + 1);
      }
      const pInput = participants.map((p) => ({
        id: p._id as string, teamCount: teamCountByParticipant.get(p._id as string) ?? 0,
      }));
      const intents = detectSyncEvents({
        quinielaId: qn._id as string, now, soonMs: SOON_MS, tournamentStarted,
        teamById: teamLiteById, effMatches: effRows, states, ownerByTeam, participants: pInput,
      });
      for (const intent of intents) await insertNotification(ctx, intent);
    }
  },
});

async function recipientFromToken(ctx: MutationCtx, personalToken?: string, adminToken?: string) {
  if (personalToken) {
    const me = await ctx.db.query("participants")
      .withIndex("by_personalToken", (q) => q.eq("personalToken", personalToken)).first();
    if (!me) throw new Error("Jugador no encontrado");
    return { quinielaId: me.quinielaId, audience: "participant" as const, participantId: me._id };
  }
  if (adminToken) {
    const qn = await ctx.db.query("quinielas")
      .withIndex("by_adminToken", (q) => q.eq("adminToken", adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    return { quinielaId: qn._id, audience: "admin" as const, participantId: undefined };
  }
  throw new Error("Falta token");
}

export const savePushSubscription = mutation({
  args: {
    personalToken: v.optional(v.string()), adminToken: v.optional(v.string()),
    endpoint: v.string(), p256dh: v.string(), auth: v.string(),
  },
  handler: async (ctx, args) => {
    const r = await recipientFromToken(ctx, args.personalToken, args.adminToken);
    const fields = {
      quinielaId: r.quinielaId, audience: r.audience, participantId: r.participantId,
      endpoint: args.endpoint, p256dh: args.p256dh, auth: args.auth, createdAt: Date.now(),
    };
    const existing = await ctx.db.query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint)).first();
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("pushSubscriptions", fields);
    return { ok: true as const };
  },
});

export const removePushSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const existing = await ctx.db.query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint)).first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true as const };
  },
});

export const pruneSubscriptions = internalMutation({
  args: { endpoints: v.array(v.string()) },
  handler: async (ctx, { endpoints }) => {
    for (const e of endpoints) {
      const s = await ctx.db.query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", e)).first();
      if (s) await ctx.db.delete(s._id);
    }
  },
});

/** Datos para enviar push de un aviso: copy, URL de deep-link y suscripciones del destinatario. */
export const getForPush = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const n = await ctx.db.get(notificationId);
    if (!n) return null;
    let url = `/q/${n.quinielaId}`;
    let subs: Doc<"pushSubscriptions">[];
    if (n.audience === "admin") {
      const qn = await ctx.db.get(n.quinielaId);
      if (qn) url = `/q/${n.quinielaId}/admin/${qn.adminToken}`;
      subs = await ctx.db.query("pushSubscriptions")
        .withIndex("by_quiniela_audience", (q) => q.eq("quinielaId", n.quinielaId).eq("audience", "admin")).collect();
    } else if (n.participantId) {
      const me = await ctx.db.get(n.participantId);
      if (me) url = `/q/${n.quinielaId}/me/${me.personalToken}`;
      subs = await ctx.db.query("pushSubscriptions")
        .withIndex("by_participant", (q) => q.eq("participantId", n.participantId!)).collect();
    } else {
      subs = [];
    }
    return {
      title: n.title, body: n.body, url,
      subscriptions: subs.map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })),
    };
  },
});
