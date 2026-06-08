// convex/lib/matchSelect.ts
// Selección del "próximo partido" y el "último resultado" de un equipo, como
// funciones puras (testables). Un partido finalizado SIN marcador (p. ej. uno
// cancelado, que mapeamos a "finished") no es un resultado real, así que se
// excluye de lastResultMatchFor para no mostrar "null–null".

type MatchLite = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  kickoffAt: number;
};

const involves = (m: MatchLite, teamId: string) =>
  m.homeTeamId === teamId || m.awayTeamId === teamId;

/** El partido aún no finalizado del equipo con kickoff más cercano. */
export function nextMatchFor<T extends MatchLite>(matches: T[], teamId: string): T | undefined {
  return matches
    .filter((m) => m.status !== "finished" && involves(m, teamId))
    .sort((a, b) => a.kickoffAt - b.kickoffAt)[0];
}

/** El partido finalizado CON marcador más reciente del equipo. */
export function lastResultMatchFor<T extends MatchLite>(matches: T[], teamId: string): T | undefined {
  return matches
    .filter(
      (m) =>
        m.status === "finished" &&
        m.homeScore != null &&
        m.awayScore != null &&
        involves(m, teamId),
    )
    .sort((a, b) => b.kickoffAt - a.kickoffAt)[0];
}
