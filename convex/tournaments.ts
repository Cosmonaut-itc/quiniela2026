// convex/tournaments.ts
import { query, action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  TOURNAMENTS,
  allowedGameModes,
  tournamentByCode,
  tournamentCodeOf,
} from "./lib/tournaments";

// The Convex runtime exposes deployment env vars on process.env; declare it
// narrowly so the V8-runtime tsconfig (no "node" types) typechecks without
// pulling all of Node's globals into scope.
declare const process: { env: Record<string, string | undefined> };

/** Catálogo + estado de datos, para el selector del formulario de creación. */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      code: v.string(),
      name: v.string(),
      shortName: v.string(),
      format: v.union(v.literal("eliminatorio"), v.literal("liga")),
      allowedModes: v.array(v.string()),
      teamCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").collect();
    const countByCode = new Map<string, number>();
    for (const tm of teams) {
      const code = tournamentCodeOf(tm);
      countByCode.set(code, (countByCode.get(code) ?? 0) + 1);
    }
    return TOURNAMENTS.map((t) => ({
      code: t.code,
      name: t.name,
      shortName: t.shortName,
      format: t.format,
      allowedModes: allowedGameModes(t.format),
      teamCount: countByCode.get(t.code) ?? 0,
    }));
  },
});

/** Torneos referidos por quinielas vivas: lo único que el cron sincroniza (ADR-0001). */
export const activeTournamentCodes = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const codes = new Set<string>();
    for (const status of ["open", "locked"] as const) {
      const rows = await ctx.db
        .query("quinielas")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const qn of rows) codes.add(tournamentCodeOf(qn));
    }
    return [...codes];
  },
});

/** Sync inicial on-demand: el formulario de creación lo invoca al elegir torneo
 *  sin datos, para que Clásica pueda repartir y Progol tenga partidos. */
export const prepare = action({
  args: { code: v.string() },
  returns: v.object({ teamCount: v.number() }),
  handler: async (ctx, { code }): Promise<{ teamCount: number }> => {
    if (!tournamentByCode(code)) throw new Error("Torneo fuera del catálogo");
    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) throw new Error("missing FOOTBALL_DATA_TOKEN");
    const result = await ctx.runAction(internal.sync.syncTournament, { code, withTeams: true });
    if (!result.ok) throw new Error(result.error ?? "No se pudo sincronizar el torneo");
    const listed = await ctx.runQuery(api.tournaments.list, {});
    return { teamCount: listed.find((t) => t.code === code)?.teamCount ?? 0 };
  },
});
