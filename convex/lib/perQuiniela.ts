// convex/lib/perQuiniela.ts
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { computeTeamStates, type MatchRow, type TeamRow, type TeamState } from "./tournament";
import { effectiveMatches, championTeamId } from "./resolve";
import { tournamentByCode, tournamentCodeOf, type TournamentFormat } from "./tournaments";

export type Resolved = {
  teams: Doc<"teams">[];
  teamById: Map<Id<"teams">, Doc<"teams">>;
  teamRows: TeamRow[];
  matches: Doc<"matches">[];
  effRows: MatchRow[];
  effById: Map<string, MatchRow>;
  overriddenMatchIds: Set<string>;
  states: Map<string, TeamState>;
  championTeamId: string | null;
  format: TournamentFormat;
  tournamentCode: string;
};

/**
 * Carga el estado DEL TORNEO de la quiniela (equipos + partidos, con normalización
 * legacy: filas sin tournamentCode = WC) y los overrides de UNA quiniela, y deriva
 * vivos/etapa/campeón PARA ESA QUINIELA. Única fuente de la resolución por quiniela:
 * todas las queries por quiniela pasan por aquí, así el aislamiento (por quiniela y
 * por torneo) es inevitable. Con cero overrides, el resultado es idéntico al baseline
 * del torneo. En ligas no hay eliminación: todos los equipos quedan alive con
 * currentStage "league" y championTeamId es null.
 *
 * Invariantes de cobertura (por eso los callers usan `!` con seguridad):
 *  - `effById` y `effRows` tienen UNA entrada por cada partido del torneo (`matches`),
 *    así que `effById.get(mt._id)!` es seguro para todo `mt` de `matches`.
 *  - `states` y `teamById` tienen UNA entrada por cada equipo del torneo, así que
 *    `states.get(teamId)!` / `teamById.get(teamId)!` son seguros para cualquier teamId
 *    de un equipo, ownership o partido del torneo de la quiniela.
 */
export async function resolveQuiniela(ctx: QueryCtx, quinielaId: Id<"quinielas">): Promise<Resolved> {
  const qn = await ctx.db.get(quinielaId);
  if (!qn) throw new Error("Quiniela no encontrada");
  const code = tournamentCodeOf(qn);
  const format = tournamentByCode(code)?.format ?? "eliminatorio";
  // Filtro en memoria (≈600 filas máx en el free tier) con normalización legacy;
  // si el volumen crece, cambiar a withIndex("by_tournament").
  const teams = (await ctx.db.query("teams").collect()).filter((t) => tournamentCodeOf(t) === code);
  const matches = (await ctx.db.query("matches").collect()).filter((m) => tournamentCodeOf(m) === code);
  const overrides = await ctx.db.query("matchOverrides")
    .withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId)).collect();

  const teamRows: TeamRow[] = teams.map((t) => ({ _id: t._id as string, group: t.group }));
  const matchRows: MatchRow[] = matches.map((mt) => ({
    _id: mt._id as string, stage: mt.stage, group: mt.group, matchday: mt.matchday ?? null,
    homeTeamId: mt.homeTeamId ?? null, awayTeamId: mt.awayTeamId ?? null,
    homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
    status: mt.status, winnerTeamId: mt.winnerTeamId ?? null, kickoffAt: mt.kickoffAt,
  }));
  const overrideRows = overrides.map((o) => ({
    matchId: o.matchId as string, homeScore: o.homeScore, awayScore: o.awayScore,
    status: o.status, winnerTeamId: (o.winnerTeamId ?? null) as string | null,
  }));

  const effRows = effectiveMatches(matchRows, overrideRows);
  const states = format === "eliminatorio"
    ? computeTeamStates(teamRows, effRows)
    : new Map<string, TeamState>(teamRows.map((t) => [t._id, { alive: true, currentStage: "league" }]));
  const champion = format === "eliminatorio" ? championTeamId(states) : null;
  return {
    teams, teamById: new Map(teams.map((t) => [t._id, t])), teamRows,
    matches, effRows, effById: new Map(effRows.map((mt) => [mt._id, mt])),
    overriddenMatchIds: new Set(overrides.map((o) => o.matchId as string)),
    states, championTeamId: champion,
    format, tournamentCode: code,
  };
}
