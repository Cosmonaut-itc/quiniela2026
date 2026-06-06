// convex/quinielas.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { newToken } from "./lib/tokens";
import { computeSlotSizes, shuffleInPlace, balancedRedistribute } from "./lib/distribution";
import { teamLite, photoUrl } from "./lib/view";
import type { OverviewData, PlayerStatus, AdminData } from "./types";

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

export const getOverview = query({
  args: { joinToken: v.string() },
  handler: async (ctx, args): Promise<OverviewData> => {
    const qn = await ctx.db.query("quinielas").withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");

    const teams = await ctx.db.query("teams").collect();
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();

    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));
    const players = participants.map((p) => {
      const mine = ownerships.filter((o) => o.participantId === p._id);
      const aliveCount = mine.filter((o) => teamById.get(o.teamId)?.alive).length;
      const isChampion = qn.championParticipantId === p._id;
      const status: PlayerStatus = isChampion ? "champion" : aliveCount > 0 ? "alive" : "out";
      return { participantId: p._id as string, name: p.name,
        photoUrlId: p.photoId, aliveCount, totalCount: mine.length, status };
    });
    players.sort((a, b) =>
      (b.status === "out" ? 0 : 1) - (a.status === "out" ? 0 : 1) || b.aliveCount - a.aliveCount);

    // upcoming duels: next scheduled matches where both teams owned in this quiniela
    const upcoming = (await ctx.db.query("matches").withIndex("by_kickoff").collect())
      .filter((mt) => mt.status !== "finished" && mt.homeTeamId && mt.awayTeamId
        && ownerByTeam.has(mt.homeTeamId) && ownerByTeam.has(mt.awayTeamId))
      .sort((a, b) => a.kickoffAt - b.kickoffAt)
      .slice(0, 8);
    const nameById = new Map(participants.map((p) => [p._id, p.name]));

    return {
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prizeText: qn.prizeText,
        numParticipants: qn.numParticipants, filledCount: participants.length, status: qn.status as any,
      },
      players: await Promise.all(players.map(async (p) => ({
        participantId: p.participantId, name: p.name, photoUrl: await photoUrl(ctx, p.photoUrlId),
        aliveCount: p.aliveCount, totalCount: p.totalCount, status: p.status,
      }))),
      freeSlots: Math.max(0, qn.numParticipants - participants.length),
      upcomingDuels: upcoming.map((mt) => ({
        homeOwner: nameById.get(ownerByTeam.get(mt.homeTeamId!)!) ?? "",
        homeTeam: teamLite(teamById.get(mt.homeTeamId!))!,
        awayOwner: nameById.get(ownerByTeam.get(mt.awayTeamId!)!) ?? "",
        awayTeam: teamLite(teamById.get(mt.awayTeamId!))!,
        kickoffAt: mt.kickoffAt,
      })),
    };
  },
});

export const getAdmin = query({
  args: { adminToken: v.string() },
  handler: async (ctx, args): Promise<AdminData> => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const teams = await ctx.db.query("teams").collect();
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const matches = (await ctx.db.query("matches").withIndex("by_kickoff").collect());

    const STAGE_LABEL: Record<string, string> = {
      group: "Grupos", r32: "Dieciseisavos", r16: "Octavos", qf: "Cuartos",
      sf: "Semis", third: "3er lugar", final: "Final",
    };
    return {
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prizeText: qn.prizeText,
        numParticipants: qn.numParticipants, filledCount: participants.length, status: qn.status as any,
        joinToken: qn.joinToken,
      },
      participants: participants.map((p) => ({
        name: p.name, personalToken: p.personalToken,
        teamCount: ownerships.filter((o) => o.participantId === p._id).length,
      })),
      matches: matches.map((mt) => ({
        externalId: mt.externalId, stage: mt.stage, label: STAGE_LABEL[mt.stage] ?? mt.stage,
        homeTeam: mt.homeTeamId ? teamLite(teamById.get(mt.homeTeamId)) : null,
        awayTeam: mt.awayTeamId ? teamLite(teamById.get(mt.awayTeamId)) : null,
        homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
        status: mt.status, manualOverride: mt.manualOverride,
      })),
    };
  },
});
