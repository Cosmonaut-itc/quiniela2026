// convex/quinielas.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { newToken } from "./lib/tokens";
import { computeSlotSizes, shuffleInPlace, balancedRedistribute } from "./lib/distribution";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const createQuiniela = mutation({
  args: {
    name: v.string(),
    prizeText: v.string(),
    numParticipants: v.number(),
    photoId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const n = Math.max(1, Math.min(48, Math.floor(args.numParticipants)));
    const slotSizes = shuffleInPlace(computeSlotSizes(n, 48), Math.random);
    const adminToken = newToken();
    const joinToken = newToken();
    const quinielaId = await ctx.db.insert("quinielas", {
      name: args.name.trim().slice(0, 60),
      prizeText: args.prizeText.trim().slice(0, 60),
      numParticipants: n,
      slotSizes,
      adminToken,
      joinToken,
      status: "open",
      photoId: args.photoId,
      createdAt: Date.now(),
    });
    return { quinielaId, adminToken, joinToken };
  },
});

export const closeAndRedistribute = mutation({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    if (qn.status !== "open") return { ok: true as const };

    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    if (participants.length === 0) throw new Error("No hay participantes");

    const owned = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownedSet = new Set(owned.map((o) => o.teamId));
    const allTeams = await ctx.db.query("teams").collect();
    const leftovers = allTeams.filter((tm) => !ownedSet.has(tm._id)).map((tm) => tm._id as string);

    if (leftovers.length > 0) {
      const counts = participants.map((p) => ({
        participantId: p._id as string,
        count: owned.filter((o) => o.participantId === p._id).length,
      }));
      const assignments = balancedRedistribute(leftovers, counts, Math.random);
      for (const a of assignments) {
        await ctx.db.insert("ownerships", {
          quinielaId: qn._id, teamId: a.teamId as any, participantId: a.participantId as any,
        });
      }
    }
    await ctx.db.patch(qn._id, { status: "locked", lockedAt: Date.now() });
    return { ok: true as const };
  },
});
