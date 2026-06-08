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

export const getGeneral = query({
  args: { joinToken: v.string() },
  handler: async (ctx, args): Promise<ProgolGeneralData> => {
    const qn = await ctx.db.query("quinielas")
      .withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const { effRows } = await resolveQuiniela(ctx, qn._id);
    const finalDone = effRows.some((mt) => mt.stage === "final" && mt.status === "finished");
    const participants = await ctx.db.query("participants")
      .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const picks = await ctx.db.query("predictions")
      .withIndex("by_quiniela_participant", (q) => q.eq("quinielaId", qn._id)).collect();
    const results = new Map<string, Pick>();
    for (const mt of effRows) { const r = matchResult(mt); if (r) results.set(mt._id, r); }
    const rows = leaderboard(
      participants.map((p) => ({ id: p._id as string })),
      picks.map((pk) => ({ participantId: pk.participantId as string, matchId: pk.matchId as string, pick: pk.pick as Pick })),
      results,
    );
    const pById = new Map(participants.map((p) => [p._id as string, p]));
    const board = await Promise.all(rows.map(async (r) => {
      const p = pById.get(r.participantId)!;
      return {
        participantId: r.participantId, name: p.name, photoUrl: await photoUrl(ctx, p.photoId),
        points: r.points, correct: r.correct, played: r.played, rank: r.rank,
      };
    }));
    const paidCount = participants.filter((p) => p.paid === true).length;
    const status = (finalDone ? "finished" : qn.status) as "open" | "locked" | "finished";
    const winnerParticipantIds = finalDone ? board.filter((b) => b.rank === 1).map((b) => b.participantId) : [];
    return {
      mode: "progol",
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prize: prizeView(qn, paidCount),
        status, filledCount: participants.length, notes: qn.notes ?? null,
      },
      leaderboard: board, decidedMatches: results.size, winnerParticipantIds,
    };
  },
});
