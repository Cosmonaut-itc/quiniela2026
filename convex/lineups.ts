import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { teamLineupValidator } from "./lib/lineupShape";
import { tournamentCodeOf } from "./lib/tournaments";
import type { Id } from "./_generated/dataModel";

/** Upsert por matchId: una sola fila de lineup por partido. */
export const upsertLineup = internalMutation({
  args: {
    matchId: v.id("matches"),
    tournamentCode: v.string(),
    apiFixtureId: v.optional(v.number()),
    home: teamLineupValidator,
    away: teamLineupValidator,
    fetchedAt: v.number(),
    confirmed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("lineups")
      .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
      .first();
    if (existing) await ctx.db.patch(existing._id, args);
    else await ctx.db.insert("lineups", args);
    return null;
  },
});

export type LiveMatchNeedingLineup = {
  matchId: Id<"matches">; tournamentCode: string;
  homeName: string; awayName: string; apiFixtureId: number | null; confirmed: boolean;
};

/** Partidos GLOBALMENTE en vivo (status real, no overrides) de los torneos `codes`
 *  (los activos los provee internal.tournaments.activeTournamentCodes desde la action),
 *  cuyo 11 aún no está confirmado en cache. Lo que el cron debe sondear.
 *  Una query no puede llamar a otra (no hay ctx.runQuery en QueryCtx); por eso los
 *  códigos llegan como argumento en vez de recalcularlos aquí. */
export const liveMatchesNeedingLineup = internalQuery({
  args: { codes: v.array(v.string()) },
  returns: v.array(v.object({
    matchId: v.id("matches"),
    tournamentCode: v.string(),
    homeName: v.string(),
    awayName: v.string(),
    apiFixtureId: v.union(v.number(), v.null()),
    confirmed: v.boolean(),
  })),
  handler: async (ctx, { codes }): Promise<LiveMatchNeedingLineup[]> => {
    const active = new Set(codes);
    if (active.size === 0) return [];

    // Scan en memoria (≤ ~600 filas en free tier, igual que resolveQuiniela).
    const matches = (await ctx.db.query("matches").collect()).filter(
      (m) => m.status === "live" && active.has(tournamentCodeOf(m)),
    );

    const out: LiveMatchNeedingLineup[] = [];
    for (const m of matches) {
      const existing = await ctx.db
        .query("lineups")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .first();
      if (existing?.confirmed) continue;
      const home = m.homeTeamId ? await ctx.db.get(m.homeTeamId) : null;
      const away = m.awayTeamId ? await ctx.db.get(m.awayTeamId) : null;
      out.push({
        matchId: m._id,
        tournamentCode: tournamentCodeOf(m),
        homeName: home?.name ?? "",
        awayName: away?.name ?? "",
        apiFixtureId: existing?.apiFixtureId ?? null,
        confirmed: existing?.confirmed ?? false,
      });
    }
    return out;
  },
});
