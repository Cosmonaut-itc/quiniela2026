import { internalMutation, internalQuery, internalAction, query } from "./_generated/server";
import { v } from "convex/values";
import { teamLineupValidator } from "./lib/lineupShape";
import { tournamentCodeOf } from "./lib/tournaments";
import { syncCronEnabled } from "./lib/syncGate";
import { teamLite } from "./lib/view";
import { internal } from "./_generated/api";
import type { LiveLineupsData, LiveMatchLineupView, TeamLineupView, LineupPlayerView } from "./types";
import type { Doc } from "./_generated/dataModel";
import {
  fetchLiveFixtures, fetchFixturesByDate, fetchLineups, matchLiveFixture, orientLineups, isConfirmed,
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
  phase: "live" | "pre"; kickoffDate: string | null;
};

// Ventana de pre-saque: sondeamos UNA vez la alineación de un partido agendado que
// arranca dentro de este margen (la API la publica ~20-40 min antes). El "una vez"
// lo garantiza el guard de "ya existe fila" más abajo, no el tamaño de la ventana.
const PRE_KICKOFF_MS = 10 * 60 * 1000;

/** Partidos que el cron debe sondear: GLOBALMENTE en vivo cuyo 11 aún no está
 *  confirmado (fase "live"), MÁS agendados que arrancan en ≤10 min y aún no tienen
 *  fila de lineup (fase "pre", una sola vez). Solo torneos en `codes` (los activos
 *  los provee internal.tournaments.activeTournamentCodes desde la action).
 *  `now` llega como argumento porque una query no puede usar Date.now() (debe ser
 *  determinista) ni llamar a otra query (no hay ctx.runQuery en QueryCtx). */
export const liveMatchesNeedingLineup = internalQuery({
  args: { codes: v.array(v.string()), now: v.number() },
  returns: v.array(v.object({
    matchId: v.id("matches"),
    tournamentCode: v.string(),
    homeName: v.string(),
    awayName: v.string(),
    apiFixtureId: v.union(v.number(), v.null()),
    confirmed: v.boolean(),
    phase: v.union(v.literal("live"), v.literal("pre")),
    kickoffDate: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, { codes, now }): Promise<LiveMatchNeedingLineup[]> => {
    const active = new Set(codes);
    if (active.size === 0) return [];

    // Scan en memoria (≤ ~600 filas en free tier, igual que resolveQuiniela).
    const matches = (await ctx.db.query("matches").collect()).filter((m) =>
      active.has(tournamentCodeOf(m)),
    );

    const out: LiveMatchNeedingLineup[] = [];
    for (const m of matches) {
      const untilKickoff = m.kickoffAt - now;
      const isLive = m.status === "live";
      const isPre = m.status === "scheduled" && untilKickoff > 0 && untilKickoff <= PRE_KICKOFF_MS;
      if (!isLive && !isPre) continue;

      const existing = await ctx.db
        .query("lineups")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .first();
      // live: si el 11 ya está confirmado no hay nada que sondear.
      // pre: si ya hay CUALQUIER fila, ya lo sondeamos una vez → no repetir.
      if (isLive && existing?.confirmed) continue;
      if (isPre && existing) continue;

      const home = m.homeTeamId ? await ctx.db.get(m.homeTeamId) : null;
      const away = m.awayTeamId ? await ctx.db.get(m.awayTeamId) : null;
      out.push({
        matchId: m._id,
        tournamentCode: tournamentCodeOf(m),
        homeName: home?.name ?? "",
        awayName: away?.name ?? "",
        apiFixtureId: existing?.apiFixtureId ?? null,
        confirmed: existing?.confirmed ?? false,
        phase: isLive ? "live" : "pre",
        kickoffDate: isLive ? null : new Date(m.kickoffAt).toISOString().slice(0, 10),
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
  phase?: "live" | "pre";       // ausente = "live" (compat con llamadas legacy)
  kickoffDate?: string | null;  // YYYY-MM-DD (UTC) para descubrir el fixture en fase "pre"
};
type SyncDeps = {
  fetchLive: () => Promise<LiveFixture[]>;
  fetchByDate?: (date: string) => Promise<LiveFixture[]>; // requerido solo si hay candidatos "pre"
  fetchOne: (fixtureId: number) => Promise<MappedTeamLineup[]>;
  upsert: (u: LineupUpsert) => Promise<void>;
  now?: number;
};

/** Núcleo puro del ciclo (deps inyectadas para testear sin red ni Convex):
 *  0 llamadas si no hay candidatos. Los "live" se reconcilian contra /fixtures?live=all
 *  (1 llamada); los "pre" (agendados por arrancar) no aparecen ahí, así que su fixture
 *  se descubre por fecha (1 llamada por fecha distinta). Luego 1 lineup por partido
 *  reconciliado. Un fallo por partido se loguea y no aborta el resto. */
export async function runLineupSync(
  candidates: LiveMatchInput[],
  deps: SyncDeps,
): Promise<void> {
  if (candidates.length === 0) return;
  const now = deps.now ?? 0;

  const fixtures: LiveFixture[] = [];
  if (candidates.some((c) => (c.phase ?? "live") === "live")) {
    fixtures.push(...(await deps.fetchLive()));
  }
  const preDates = [
    ...new Set(
      candidates
        .filter((c) => c.phase === "pre")
        .map((c) => c.kickoffDate)
        .filter((d): d is string => !!d),
    ),
  ];
  if (deps.fetchByDate) {
    for (const d of preDates) fixtures.push(...(await deps.fetchByDate(d)));
  }
  // live=all y la búsqueda por fecha pueden traer el mismo fixture: deduplica por id.
  const byId = new Map<number, LiveFixture>();
  for (const f of fixtures) if (!byId.has(f.fixtureId)) byId.set(f.fixtureId, f);
  const uniqueFixtures = [...byId.values()];

  for (const m of candidates) {
    try {
      const fixture = matchLiveFixture(m, uniqueFixtures);
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
    // dev (o kill-switch de emergencia en prod) apaga el cron con DISABLE_SYNC=1.
    if (!syncCronEnabled(process.env)) return { ok: true };
    const token = process.env.API_FOOTBALL_TOKEN;
    if (!token) return { ok: false, error: "missing API_FOOTBALL_TOKEN" };
    // Reusa el helper canónico de "torneos con quiniela viva" (ADR-0001).
    const codes = await ctx.runQuery(internal.tournaments.activeTournamentCodes, {});
    const now = Date.now();
    const live = await ctx.runQuery(internal.lineups.liveMatchesNeedingLineup, { codes, now });
    await runLineupSync(live, {
      fetchLive: () => fetchLiveFixtures(token),
      fetchByDate: (date) => fetchFixturesByDate(token, date),
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

function playerView(p: { name: string; number?: number; pos?: string }): LineupPlayerView {
  return { name: p.name, number: p.number ?? null, pos: p.pos ?? null };
}
function teamLineupView(t: Doc<"lineups">["home"]): TeamLineupView {
  return { formation: t.formation, coach: t.coach, startXI: t.startXI.map(playerView), bench: t.bench.map(playerView) };
}

/** Partidos en vivo del torneo de la quiniela + su alineación cacheada. Reactiva. */
export const getLiveLineups = query({
  args: { quinielaId: v.id("quinielas") },
  returns: v.object({
    matches: v.array(v.object({
      matchId: v.string(),
      status: v.union(v.literal("live"), v.literal("scheduled")),
      kickoffAt: v.number(),
      home: v.union(v.object({ code: v.string(), name: v.string(), flag: v.string(), group: v.string() }), v.null()),
      away: v.union(v.object({ code: v.string(), name: v.string(), flag: v.string(), group: v.string() }), v.null()),
      homeScore: v.union(v.number(), v.null()),
      awayScore: v.union(v.number(), v.null()),
      lineup: v.union(
        v.object({
          home: v.object({
            formation: v.string(), coach: v.string(),
            startXI: v.array(v.object({ name: v.string(), number: v.union(v.number(), v.null()), pos: v.union(v.string(), v.null()) })),
            bench: v.array(v.object({ name: v.string(), number: v.union(v.number(), v.null()), pos: v.union(v.string(), v.null()) })),
          }),
          away: v.object({
            formation: v.string(), coach: v.string(),
            startXI: v.array(v.object({ name: v.string(), number: v.union(v.number(), v.null()), pos: v.union(v.string(), v.null()) })),
            bench: v.array(v.object({ name: v.string(), number: v.union(v.number(), v.null()), pos: v.union(v.string(), v.null()) })),
          }),
        }),
        v.null(),
      ),
    })),
  }),
  handler: async (ctx, { quinielaId }): Promise<LiveLineupsData> => {
    const qn = await ctx.db.get(quinielaId);
    if (!qn) return { matches: [] };
    const code = tournamentCodeOf(qn);
    const candidates = (await ctx.db.query("matches").collect()).filter(
      (m) => tournamentCodeOf(m) === code && (m.status === "live" || m.status === "scheduled"),
    );
    const out: LiveMatchLineupView[] = [];
    for (const m of candidates) {
      const row = await ctx.db
        .query("lineups")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .first();
      // En vivo: siempre se muestra (aunque el 11 aún no esté completo).
      // Agendado: solo si el sondeo pre-saque ya dejó una alineación CONFIRMADA,
      // así el usuario la ve antes del pitazo sin tarjetas a medias.
      if (m.status === "scheduled" && !row?.confirmed) continue;
      const home = m.homeTeamId ? await ctx.db.get(m.homeTeamId) : null;
      const away = m.awayTeamId ? await ctx.db.get(m.awayTeamId) : null;
      out.push({
        matchId: m._id as string,
        status: m.status === "live" ? "live" : "scheduled",
        kickoffAt: m.kickoffAt,
        home: teamLite(home),
        away: teamLite(away),
        homeScore: m.homeScore ?? null,
        awayScore: m.awayScore ?? null,
        lineup: row ? { home: teamLineupView(row.home), away: teamLineupView(row.away) } : null,
      });
    }
    return { matches: out };
  },
});
