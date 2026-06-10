// convex/sync.ts
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { fetchMatches, fetchTeams } from "./lib/footballData";
import { tournamentByCode } from "./lib/tournaments";

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

// Free tier: 10 llamadas/min. Entre torneos esperamos 6.5s para nunca rebasarlo
// aunque el ciclo sincronice los 12 del catálogo.
export const SPACING_MS = 6_500;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Cuerpo puro del ciclo (deps inyectadas para testear sin dormir de verdad):
 *  recorre los torneos secuencialmente con pausa ENTRE llamadas — nunca antes
 *  de la primera. Un fallo se registra (logs de Convex) y no aborta el resto;
 *  syncTournament atrapa sus propios errores, así que syncOne nunca lanza. */
export async function runSyncCycle(
  codes: string[],
  syncOne: (code: string) => Promise<{ ok: boolean; error?: string }>,
  pause: (ms: number) => Promise<void>,
): Promise<string[]> {
  const synced: string[] = [];
  for (const [i, code] of codes.entries()) {
    if (i > 0) await pause(SPACING_MS);
    const res = await syncOne(code);
    if (res.ok) synced.push(code);
    else console.error(`sync de ${code} falló: ${res.error}`);
  }
  return synced;
}

/** Entrada del cron: recorre los torneos con quinielas vivas, espaciado. */
export const syncMatches = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), synced: v.array(v.string()) }),
  handler: async (ctx): Promise<{ ok: boolean; synced: string[] }> => {
    const codes = await ctx.runQuery(internal.tournaments.activeTournamentCodes, {});
    const synced = await runSyncCycle(
      codes,
      (code) => ctx.runAction(internal.sync.syncTournament, { code }),
      sleep,
    );
    return { ok: true, synced };
  },
});
