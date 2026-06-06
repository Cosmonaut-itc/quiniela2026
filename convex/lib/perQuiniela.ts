// convex/lib/perQuiniela.ts
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { computeTeamStates, type MatchRow, type TeamRow, type TeamState } from "./tournament";
import { effectiveMatches, championTeamId } from "./resolve";

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
};

/**
 * Carga el estado global (equipos + partidos) y los overrides de UNA quiniela, y
 * deriva vivos/etapa/campeón PARA ESA QUINIELA. Única fuente de la resolución por
 * quiniela: todas las queries por quiniela pasan por aquí, así el aislamiento es
 * inevitable. Con cero overrides, el resultado es idéntico al baseline global.
 */
export async function resolveQuiniela(ctx: QueryCtx, quinielaId: Id<"quinielas">): Promise<Resolved> {
  const teams = await ctx.db.query("teams").collect();
  const matches = await ctx.db.query("matches").collect();
  const overrides = await ctx.db.query("matchOverrides")
    .withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId)).collect();

  const teamRows: TeamRow[] = teams.map((t) => ({ _id: t._id as string, group: t.group }));
  const matchRows: MatchRow[] = matches.map((mt) => ({
    _id: mt._id as string, stage: mt.stage, group: mt.group,
    homeTeamId: mt.homeTeamId ?? null, awayTeamId: mt.awayTeamId ?? null,
    homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
    status: mt.status, winnerTeamId: mt.winnerTeamId ?? null, kickoffAt: mt.kickoffAt,
  }));
  const overrideRows = overrides.map((o) => ({
    matchId: o.matchId as string, homeScore: o.homeScore, awayScore: o.awayScore,
    status: o.status, winnerTeamId: (o.winnerTeamId as string) ?? null,
  }));

  const effRows = effectiveMatches(matchRows, overrideRows);
  const states = computeTeamStates(teamRows, effRows);
  return {
    teams, teamById: new Map(teams.map((t) => [t._id, t])), teamRows,
    matches, effRows, effById: new Map(effRows.map((mt) => [mt._id, mt])),
    overriddenMatchIds: new Set(overrides.map((o) => o.matchId as string)),
    states, championTeamId: championTeamId(states),
  };
}
