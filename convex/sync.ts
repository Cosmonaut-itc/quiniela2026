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

/** Delegación delgada al cron de 5 min: sincroniza el Mundial (WC).
 *  Antes del refactor, el cuerpo estaba aquí directamente; ahora delega a
 *  syncTournament para reusar la lógica con cualquier torneo del catálogo.
 *  Pasos preservados: fetchMatches → upsertMatchResult × N →
 *  recomputeTeamStates → autoCloseDue → detectFromSync → { ok, error? }. */
export const syncMatches = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx): Promise<{ ok: boolean; error?: string }> => {
    return await ctx.runAction(internal.sync.syncTournament, { code: "WC" });
  },
});
