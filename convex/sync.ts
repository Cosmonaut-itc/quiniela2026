// convex/sync.ts
import { internalAction, internalQuery, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { fetchMatches, fetchTeams } from "./lib/footballData";
import { tournamentByCode } from "./lib/tournaments";
import { syncCronEnabled } from "./lib/syncGate";
import { anyMatchDueForSync, MATCH_SOON_MS, SYNC_PAST_MS } from "./lib/syncWindow";

// The Convex runtime exposes deployment env vars on process.env; declare it
// narrowly so the V8-runtime tsconfig (no "node" types) typechecks without
// pulling all of Node's globals into scope.
declare const process: { env: Record<string, string | undefined> };

/** Sincroniza UN torneo: equipos (opcional) + partidos + estados + cierres + avisos. */
export const syncTournament = internalAction({
  args: { code: v.string(), withTeams: v.optional(v.boolean()) },
  returns: v.object({ ok: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, { code, withTeams }): Promise<{ ok: boolean; error?: string }> => {
    const tournament = tournamentByCode(code);
    if (!tournament) return { ok: false, error: `torneo desconocido: ${code}` };
    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) return { ok: false, error: "missing FOOTBALL_DATA_TOKEN" };
    try {
      if (withTeams) {
        const teams = await fetchTeams(token, code);
        for (const team of teams) {
          await ctx.runMutation(internal.matches.upsertTeam, {
            team, tournamentCode: code, format: tournament.format,
          });
        }
      }
      const matches = await fetchMatches(token, code);
      for (const match of matches) {
        await ctx.runMutation(internal.matches.upsertMatchResult, { tournamentCode: code, match });
      }
      await ctx.runMutation(internal.matches.recomputeTeamStates, { tournamentCode: code });
      await ctx.runMutation(internal.quinielas.autoCloseDue, {});
      await ctx.runMutation(internal.notifications.detectFromSync, {});
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e instanceof Error ? e.message : e) };
    }
  },
});

// Free tier: 10 llamadas/min. Con pausas de 7s, 9 pausas colocan la 10ª llamada
// en t=63s: nunca caben más de 9 llamadas en cualquier ventana rodante de 60s,
// aunque el ciclo sincronice los 12 torneos del catálogo.
export const SPACING_MS = 7_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Cuerpo puro del ciclo (deps inyectadas para testear sin dormir de verdad):
 *  recorre los torneos secuencialmente con pausa ENTRE llamadas — nunca antes
 *  de la primera. Un fallo se registra (logs de Convex) y no aborta el resto;
 *  el catch sobre syncOne lo garantiza incluso si la promesa rechaza (errores
 *  de sistema de Convex en ctx.runAction: fallos transitorios, timeouts). */
export async function runSyncCycle(
  codes: string[],
  syncOne: (code: string) => Promise<{ ok: boolean; error?: string }>,
  pause: (ms: number) => Promise<void>,
): Promise<string[]> {
  const synced: string[] = [];
  for (const [i, code] of codes.entries()) {
    if (i > 0) await pause(SPACING_MS);
    const res = await syncOne(code).catch((e) => ({ ok: false, error: String(e) }));
    if (res.ok) synced.push(code);
    else console.error(`sync de ${code} falló: ${res.error}`);
  }
  return synced;
}

/** ¿El torneo `code` tiene AL MENOS un partido sembrado? Sonda barata por índice
 *  (una fila). WC arrastra filas legacy con tournamentCode AUSENTE (= "WC"): se
 *  cuentan para no tratar un WC ya sembrado como "vacío". */
async function hasAnySeededMatch(ctx: QueryCtx, code: string): Promise<boolean> {
  const direct = await ctx.db
    .query("matches")
    .withIndex("by_tournament_kickoff", (q) => q.eq("tournamentCode", code))
    .first();
  if (direct) return true;
  if (code === "WC") {
    const legacy = await ctx.db
      .query("matches")
      .withIndex("by_tournament_kickoff", (q) => q.eq("tournamentCode", undefined))
      .first();
    if (legacy) return true;
  }
  return false;
}

/** Idle-gate: ¿algún partido de un torneo activo está en vivo o por comenzar?
 *  Lee SOLO la ventana cercana a `now` por el índice by_kickoff (no escanea la
 *  tabla) e incluye filas legacy WC (el índice ignora tournamentCode). La decisión
 *  pura vive en lib/syncWindow para poder testearla sin DB. */
export const anyDueForSync = internalQuery({
  args: { codes: v.array(v.string()), now: v.number() },
  returns: v.boolean(),
  handler: async (ctx, { codes, now }): Promise<boolean> => {
    if (codes.length === 0) return false;
    const near = await ctx.db
      .query("matches")
      .withIndex("by_kickoff", (q) =>
        q.gte("kickoffAt", now - SYNC_PAST_MS).lte("kickoffAt", now + MATCH_SOON_MS),
      )
      .collect();
    if (anyMatchDueForSync(near, codes, now)) return true;
    // Red de seguridad de sembrado: un torneo activo SIN ningún partido sembrado
    // debe sincronizarse (prepare suele sembrar al crear la quiniela, pero si el
    // torneo tenía equipos y aún no fixtures, el cron los descubre). Un torneo YA
    // sembrado —aunque todo finalizado— NO entra aquí: así no reabrimos el
    // always-on para quinielas viejas de torneos terminados.
    for (const code of codes) {
      if (!(await hasAnySeededMatch(ctx, code))) return true;
    }
    return false;
  },
});

/** Entrada del cron: recorre los torneos con quinielas vivas, espaciado. */
export const syncMatches = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), synced: v.array(v.string()) }),
  handler: async (ctx): Promise<{ ok: boolean; synced: string[] }> => {
    // dev (o kill-switch de emergencia en prod) apaga el cron con DISABLE_SYNC=1.
    if (!syncCronEnabled(process.env)) return { ok: true, synced: [] };
    const codes = await ctx.runQuery(internal.tournaments.activeTournamentCodes, {});
    // Idle-gate: si ningún partido está en vivo ni por comenzar, no hay nada que
    // hacer este ciclo — saltamos fetch + upserts + recompute + detect (el grueso
    // del Database I/O) hasta que se acerque un partido.
    const now = Date.now();
    if (!(await ctx.runQuery(internal.sync.anyDueForSync, { codes, now }))) {
      return { ok: true, synced: [] };
    }
    const synced = await runSyncCycle(
      codes,
      (code) => ctx.runAction(internal.sync.syncTournament, { code }),
      sleep,
    );
    return { ok: true, synced };
  },
});
