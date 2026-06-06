import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { NotificationItem, NotificationsData } from "./types";
import type { NotifyIntent } from "./lib/notify";

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
  returns: v.object({
    items: v.array(
      v.object({
        id: v.string(),
        type: v.string(),
        title: v.string(),
        body: v.string(),
        createdAt: v.number(),
        read: v.boolean(),
      }),
    ),
    unreadCount: v.number(),
  }),
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
  returns: v.object({
    items: v.array(
      v.object({
        id: v.string(),
        type: v.string(),
        title: v.string(),
        body: v.string(),
        createdAt: v.number(),
        read: v.boolean(),
      }),
    ),
    unreadCount: v.number(),
  }),
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
  returns: v.object({ ok: v.literal(true) }),
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
        .collect();
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
        .collect();
    } else {
      throw new Error("Falta token");
    }
    for (const r of rows) {
      if (r.readAt == null) await ctx.db.patch(r._id, { readAt: now });
    }
    return { ok: true as const };
  },
});
