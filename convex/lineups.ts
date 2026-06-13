import { internalMutation, internalQuery, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { teamLineupValidator } from "./lib/lineupShape";
import { tournamentCodeOf } from "./lib/tournaments";
import { internal } from "./_generated/api";
import {
  fetchLiveFixtures, fetchLineups, matchLiveFixture, orientLineups, isConfirmed,
  type LiveFixture, type MappedTeamLineup, type StoredLineups,
} from "./lib/apiFootball";
import type { Id } from "./_generated/dataModel";

declare const process: { env: Record<string, string | undefined> };

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

export type LineupUpsert = {
  matchId: string; tournamentCode: string; apiFixtureId: number;
  home: StoredLineups["home"]; away: StoredLineups["away"]; fetchedAt: number; confirmed: boolean;
};
// matchId: string (no Id<>) para que el núcleo puro sea testeable con literales
// "m1"; LiveMatchNeedingLineup (matchId: Id<"matches">) es asignable porque Id ⊂ string.
type LiveMatchInput = {
  matchId: string; tournamentCode: string;
  homeName: string; awayName: string; apiFixtureId: number | null; confirmed: boolean;
};
type SyncDeps = {
  fetchLive: () => Promise<LiveFixture[]>;
  fetchOne: (fixtureId: number) => Promise<MappedTeamLineup[]>;
  upsert: (u: LineupUpsert) => Promise<void>;
  now?: number;
};

/** Núcleo puro del ciclo (deps inyectadas para testear sin red ni Convex):
 *  0 llamadas si no hay partidos en vivo; si los hay, 1 live=all + 1 lineup por
 *  partido reconciliado. Un fallo por partido se loguea y no aborta el resto. */
export async function runLineupSync(
  live: LiveMatchInput[],
  deps: SyncDeps,
): Promise<void> {
  if (live.length === 0) return;
  const fixtures = await deps.fetchLive();
  const now = deps.now ?? 0;
  for (const m of live) {
    try {
      const fixture = matchLiveFixture(m, fixtures);
      if (!fixture) continue;
      const teams = await deps.fetchOne(fixture.fixtureId);
      const oriented = orientLineups(teams, fixture);
      await deps.upsert({
        matchId: m.matchId, tournamentCode: m.tournamentCode, apiFixtureId: fixture.fixtureId,
        home: oriented.home, away: oriented.away, fetchedAt: now, confirmed: isConfirmed(oriented),
      });
    } catch (e) {
      console.error(`lineup de ${m.matchId} falló: ${String(e instanceof Error ? e.message : e)}`);
    }
  }
}

/** Entrada del cron: sondea alineaciones de partidos en vivo. */
export const syncLineups = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx): Promise<{ ok: boolean; error?: string }> => {
    const token = process.env.API_FOOTBALL_TOKEN;
    if (!token) return { ok: false, error: "missing API_FOOTBALL_TOKEN" };
    // Reusa el helper canónico de "torneos con quiniela viva" (ADR-0001).
    const codes = await ctx.runQuery(internal.tournaments.activeTournamentCodes, {});
    const live = await ctx.runQuery(internal.lineups.liveMatchesNeedingLineup, { codes });
    await runLineupSync(live, {
      fetchLive: () => fetchLiveFixtures(token),
      fetchOne: (fixtureId) => fetchLineups(token, fixtureId),
      upsert: async (u) => {
        await ctx.runMutation(internal.lineups.upsertLineup, {
          matchId: u.matchId as Id<"matches">,
          tournamentCode: u.tournamentCode, apiFixtureId: u.apiFixtureId,
          home: u.home, away: u.away, fetchedAt: u.fetchedAt, confirmed: u.confirmed,
        });
      },
      now: Date.now(),
    });
    return { ok: true };
  },
});
