// convex/progol.ts
import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveQuiniela } from "./lib/perQuiniela";
import { teamLite, photoUrl, prizeView, gameModeOf } from "./lib/view";
import {
  matchResult, matchUiState, leaderboard, stageRank, STAGE_LABEL,
} from "./lib/progol";
import type {
  Pick, ProgolGeneralData, ProgolCardData, ProgolMatchView, ProgolAdminData,
} from "./types";

export const predict = mutation({
  args: {
    personalToken: v.string(),
    matchId: v.id("matches"),
    pick: v.union(v.literal("home"), v.literal("draw"), v.literal("away")),
  },
  handler: async (ctx, args) => {
    const me = await ctx.db.query("participants")
      .withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken)).first();
    if (!me) throw new Error("Jugador no encontrado");
    const qn = await ctx.db.get(me.quinielaId);
    if (!qn) throw new Error("Quiniela no encontrada");
    if (gameModeOf(qn) !== "progol") throw new Error("Esta quiniela no es de pronósticos");
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Partido no encontrado");
    if (!match.homeTeamId || !match.awayTeamId) throw new Error("Ese partido aún no tiene rivales definidos");
    if (match.status !== "scheduled" || Date.now() >= match.kickoffAt) throw new Error("Ese partido ya cerró");

    const mine = await ctx.db.query("predictions")
      .withIndex("by_quiniela_participant", (q) => q.eq("quinielaId", qn._id).eq("participantId", me._id))
      .collect();
    const row = mine.find((p) => p.matchId === args.matchId);
    if (row) await ctx.db.patch(row._id, { pick: args.pick, updatedAt: Date.now() });
    else await ctx.db.insert("predictions", {
      quinielaId: qn._id, participantId: me._id, matchId: args.matchId, pick: args.pick, updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
