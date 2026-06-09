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
    // El bloqueo se evalúa contra el partido GLOBAL (kickoff/status reales), no
    // contra effRows: un override de marcador del admin no debe abrir ni cerrar la
    // ventana de edición. El puntaje sí usa effRows con overrides (ver getGeneral).
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

/** Construye la tarjeta de pronósticos de un participante (mía en getPersonal, ajena en getCard). */
async function buildCard(ctx: QueryCtx, qn: Doc<"quinielas">, who: Doc<"participants">): Promise<ProgolCardData> {
  const { teamById, effRows } = await resolveQuiniela(ctx, qn._id);
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
  const myRow = rows.find((r) => r.participantId === (who._id as string))!;
  const myPickByMatch = new Map<string, Pick>();
  for (const pk of picks) if (pk.participantId === who._id) myPickByMatch.set(pk.matchId as string, pk.pick as Pick);

  const now = Date.now();
  const finalDone = effRows.some((mt) => mt.stage === "final" && mt.status === "finished");
  const byStage = new Map<string, ProgolMatchView[]>();
  for (const mt of [...effRows].sort((a, b) => a.kickoffAt - b.kickoffAt)) {
    const result = matchResult(mt);
    const pick = myPickByMatch.get(mt._id) ?? null;
    const view: ProgolMatchView = {
      matchId: mt._id, stage: mt.stage, label: STAGE_LABEL[mt.stage] ?? mt.stage,
      home: mt.homeTeamId ? teamLite(teamById.get(mt.homeTeamId as Id<"teams">)) : null,
      away: mt.awayTeamId ? teamLite(teamById.get(mt.awayTeamId as Id<"teams">)) : null,
      kickoffAt: mt.kickoffAt, state: matchUiState(mt, now),
      pick, result, correct: result ? (pick != null ? pick === result : null) : null,
      homeScore: mt.homeScore, awayScore: mt.awayScore,
    };
    if (!byStage.has(mt.stage)) byStage.set(mt.stage, []);
    byStage.get(mt.stage)!.push(view);
  }
  const stages = [...byStage.entries()]
    .sort((a, b) => stageRank(a[0]) - stageRank(b[0]))
    .map(([stage, matches]) => ({ stage, label: STAGE_LABEL[stage] ?? stage, matches }));
  const paidCount = participants.filter((p) => p.paid === true).length;
  return {
    mode: "progol",
    quinielaId: qn._id as string, quinielaName: qn.name, joinToken: qn.joinToken,
    prize: prizeView(qn, paidCount),
    status: (finalDone ? "finished" : qn.status) as "open" | "locked" | "finished",
    who: {
      participantId: who._id as string, name: who.name, photoUrl: await photoUrl(ctx, who.photoId),
      points: myRow.points, rank: myRow.rank, correct: myRow.correct, played: myRow.played,
    },
    stages,
  };
}

export const getPersonal = query({
  args: { personalToken: v.string() },
  handler: async (ctx, args): Promise<ProgolCardData> => {
    const me = await ctx.db.query("participants")
      .withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken)).first();
    if (!me) throw new Error("Jugador no encontrado");
    const qn = await ctx.db.get(me.quinielaId);
    if (!qn) throw new Error("Quiniela no encontrada");
    return buildCard(ctx, qn, me);
  },
});

export const getCard = query({
  args: { joinToken: v.string(), participantId: v.id("participants") },
  handler: async (ctx, args): Promise<ProgolCardData> => {
    const qn = await ctx.db.query("quinielas")
      .withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const who = await ctx.db.get(args.participantId);
    if (!who || who.quinielaId !== qn._id) throw new Error("Jugador no encontrado");
    return buildCard(ctx, qn, who);
  },
});

export const getAdmin = query({
  args: { adminToken: v.string() },
  handler: async (ctx, args): Promise<ProgolAdminData> => {
    const qn = await ctx.db.query("quinielas")
      .withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const { teamById, effById, effRows, overriddenMatchIds, matches } = await resolveQuiniela(ctx, qn._id);
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
    const rowById = new Map(rows.map((r) => [r.participantId, r]));
    const paidCount = participants.filter((p) => p.paid === true).length;
    const efectivoCount = participants.filter((p) => p.paymentMethod === "efectivo").length;
    const transferenciaCount = participants.filter((p) => p.paymentMethod === "transferencia").length;
    const finalDone = effRows.some((mt) => mt.stage === "final" && mt.status === "finished");
    const sorted = [...matches].sort((a, b) => a.kickoffAt - b.kickoffAt);
    return {
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prize: prizeView(qn, paidCount),
        status: (finalDone ? "finished" : qn.status) as "open" | "locked" | "finished",
        joinToken: qn.joinToken, notes: qn.notes ?? null, filledCount: participants.length,
        methodCounts: { efectivo: efectivoCount, transferencia: transferenciaCount },
      },
      participants: participants.map((p) => {
        const r = rowById.get(p._id as string)!;
        return {
          id: p._id as string, name: p.name, personalToken: p.personalToken,
          points: r.points, played: r.played, paid: p.paid === true, paymentMethod: p.paymentMethod ?? null,
        };
      }),
      matches: sorted.map((mt) => {
        const e = effById.get(mt._id as string)!;
        const winner = e.winnerTeamId ? teamById.get(e.winnerTeamId as Id<"teams">) : null;
        return {
          externalId: mt.externalId, stage: mt.stage, label: STAGE_LABEL[mt.stage] ?? mt.stage,
          homeTeam: mt.homeTeamId ? teamLite(teamById.get(mt.homeTeamId)) : null,
          awayTeam: mt.awayTeamId ? teamLite(teamById.get(mt.awayTeamId)) : null,
          homeExternalId: mt.homeTeamId ? teamById.get(mt.homeTeamId)?.externalId ?? null : null,
          awayExternalId: mt.awayTeamId ? teamById.get(mt.awayTeamId)?.externalId ?? null : null,
          homeScore: e.homeScore, awayScore: e.awayScore, status: e.status,
          winnerExternalId: winner?.externalId ?? null, manualOverride: overriddenMatchIds.has(mt._id as string),
        };
      }),
    };
  },
});

export const closeRegistration = mutation({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas")
      .withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    if (gameModeOf(qn) !== "progol") throw new Error("Solo aplica a quinielas de pronósticos");
    if (qn.status === "open") await ctx.db.patch(qn._id, { status: "locked", lockedAt: Date.now() });
    return { ok: true as const };
  },
});
