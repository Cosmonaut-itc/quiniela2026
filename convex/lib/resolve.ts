// convex/lib/resolve.ts
import type { MatchRow, TeamState } from "./tournament";

export type OverrideRow = {
  matchId: string;
  homeScore: number;
  awayScore: number;
  status: string;
  winnerTeamId: string | null;
};

/**
 * Partidos globales con los overrides de UNA quiniela encima. El override solo
 * reemplaza el resultado (score/status/winner); equipos, etapa, grupo y kickoff
 * quedan como la verdad global (API). Los partidos sin override se devuelven tal cual.
 */
export function effectiveMatches(matches: MatchRow[], overrides: OverrideRow[]): MatchRow[] {
  if (overrides.length === 0) return matches;
  const byId = new Map(overrides.map((o) => [o.matchId, o]));
  return matches.map((mt) => {
    const o = byId.get(mt._id);
    return o
      ? { ...mt, homeScore: o.homeScore, awayScore: o.awayScore, status: o.status, winnerTeamId: o.winnerTeamId }
      : mt;
  });
}

/** El equipo cuyo estado derivado es "champion", o null si la final no está decidida. */
export function championTeamId(states: Map<string, TeamState>): string | null {
  for (const [id, s] of states) if (s.currentStage === "champion") return id;
  return null;
}
