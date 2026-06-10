// convex/lib/standings.ts
import type { MatchRow, TeamRow } from "./tournament";

export type LeagueStandingRow = {
  teamId: string; points: number; played: number; gf: number; ga: number; gd: number;
};

/** Tabla de posiciones de liga: 3/1/0, ordenada por pts, diferencia, goles a favor. */
export function computeLeagueStandings(teams: TeamRow[], matches: MatchRow[]): LeagueStandingRow[] {
  const rows = new Map<string, LeagueStandingRow>(
    teams.map((t) => [t._id, { teamId: t._id, points: 0, played: 0, gf: 0, ga: 0, gd: 0 }]),
  );
  for (const m of matches) {
    if (m.status !== "finished" || m.homeScore == null || m.awayScore == null) continue;
    const home = m.homeTeamId ? rows.get(m.homeTeamId) : undefined;
    const away = m.awayTeamId ? rows.get(m.awayTeamId) : undefined;
    if (!home || !away) continue;
    home.played++; away.played++;
    home.gf += m.homeScore; home.ga += m.awayScore;
    away.gf += m.awayScore; away.ga += m.homeScore;
    if (m.homeScore > m.awayScore) home.points += 3;
    else if (m.awayScore > m.homeScore) away.points += 3;
    else { home.points++; away.points++; }
  }
  const out = [...rows.values()];
  for (const r of out) r.gd = r.gf - r.ga;
  return out.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
}
