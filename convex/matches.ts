// convex/matches.ts
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { computeTeamStates, type MatchRow, type TeamRow } from "./lib/tournament";

const apiMatch = v.object({
  externalId: v.string(),
  stage: v.string(),
  group: v.union(v.string(), v.null()),
  homeExternalId: v.union(v.string(), v.null()),
  awayExternalId: v.union(v.string(), v.null()),
  kickoffAt: v.number(),
  homeScore: v.union(v.number(), v.null()),
  awayScore: v.union(v.number(), v.null()),
  status: v.string(),
  winnerExternalId: v.optional(v.union(v.string(), v.null())),
  bracketSlot: v.union(v.string(), v.null()),
});

async function teamIdByExternal(ctx: MutationCtx, ext: string | null): Promise<Id<"teams"> | undefined> {
  if (!ext) return undefined;
  const t = await ctx.db.query("teams").withIndex("by_externalId", (q) => q.eq("externalId", ext)).first();
  return t?._id;
}

function winnerOf(
  homeId: Id<"teams"> | undefined,
  awayId: Id<"teams"> | undefined,
  hs: number | null,
  as: number | null,
): Id<"teams"> | undefined {
  if (hs == null || as == null) return undefined;
  if (hs > as) return homeId;
  if (as > hs) return awayId;
  // Score-based fallback only: an equal score yields no winner here. The authoritative
  // knockout winner (incl. extra time / penalties) comes from match.winnerExternalId.
  return undefined;
}

export const upsertMatchResult = internalMutation({
  args: { match: apiMatch },
  handler: async (ctx, { match }) => {
    const existing = await ctx.db
      .query("matches").withIndex("by_externalId", (q) => q.eq("externalId", match.externalId)).first();
    if (existing?.manualOverride) return; // never clobber a manual correction

    const homeTeamId = (await teamIdByExternal(ctx, match.homeExternalId)) ?? existing?.homeTeamId;
    const awayTeamId = (await teamIdByExternal(ctx, match.awayExternalId)) ?? existing?.awayTeamId;
    // Prefer the API's explicit winner (covers ET/penalties where scores are equal);
    // fall back to the score-derived winner only when no explicit winner is given.
    const winnerTeamId =
      match.status !== "finished"
        ? undefined
        : typeof match.winnerExternalId === "string"
          ? await teamIdByExternal(ctx, match.winnerExternalId)
          : winnerOf(homeTeamId, awayTeamId, match.homeScore, match.awayScore);

    const fields = {
      stage: match.stage,
      group: match.group ?? undefined,
      homeTeamId, awayTeamId,
      kickoffAt: match.kickoffAt,
      homeScore: match.homeScore ?? undefined,
      awayScore: match.awayScore ?? undefined,
      status: match.status,
      winnerTeamId,
      externalId: match.externalId,
      manualOverride: existing?.manualOverride ?? false,
      bracketSlot: match.bracketSlot ?? existing?.bracketSlot,
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("matches", fields);
  },
});

export const recomputeTeamStates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").collect();
    const matches = await ctx.db.query("matches").collect();
    const states = computeTeamStates(
      teams.map((t) => ({ _id: t._id, group: t.group })) as TeamRow[],
      matches.map((mt) => ({
        _id: mt._id, stage: mt.stage, group: mt.group,
        homeTeamId: mt.homeTeamId ?? null, awayTeamId: mt.awayTeamId ?? null,
        homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
        status: mt.status, winnerTeamId: mt.winnerTeamId ?? null, kickoffAt: mt.kickoffAt,
      })) as MatchRow[],
    );
    for (const t of teams) {
      const s = states.get(t._id)!;
      if (t.alive !== s.alive || t.currentStage !== s.currentStage) {
        await ctx.db.patch(t._id, { alive: s.alive, currentStage: s.currentStage, eliminatedAt: s.eliminatedAt });
      }
    }
    // finalize champion → quiniela winners
    const champion = teams.find((t) => states.get(t._id)!.currentStage === "champion");
    if (champion) {
      const quinielas = await ctx.db.query("quinielas").withIndex("by_status", (q) => q.eq("status", "locked")).collect();
      for (const qn of quinielas) {
        const own = await ctx.db.query("ownerships")
          .withIndex("by_quiniela_team", (q) => q.eq("quinielaId", qn._id).eq("teamId", champion._id)).first();
        if (own) await ctx.db.patch(qn._id, { status: "finished", championParticipantId: own.participantId });
      }
    }
  },
});

export const setMatchResultManual = mutation({
  args: { adminToken: v.string(), matchExternalId: v.string(),
          homeScore: v.number(), awayScore: v.number(), finished: v.boolean(),
          winnerExternalId: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const match = await ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", args.matchExternalId)).first();
    if (!match) throw new Error("Partido no encontrado");
    // An explicit winner lets an admin resolve a tied knockout (penalties / extra time);
    // otherwise fall back to the score (home>away→home, away>home→away, tie→none).
    const winnerTeamId = !args.finished ? undefined
      : typeof args.winnerExternalId === "string" ? await teamIdByExternal(ctx, args.winnerExternalId)
      : args.homeScore > args.awayScore ? match.homeTeamId
      : args.awayScore > args.homeScore ? match.awayTeamId : undefined;
    await ctx.db.patch(match._id, {
      homeScore: args.homeScore, awayScore: args.awayScore,
      status: args.finished ? "finished" : "live",
      winnerTeamId, manualOverride: true,
    });
    await ctx.runMutation(internal.matches.recomputeTeamStates, {});
    return { ok: true as const };
  },
});
