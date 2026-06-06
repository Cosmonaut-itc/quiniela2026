// convex/lib/tournament.ts
export type TeamRow = { _id: string; group: string };
export type MatchRow = {
  _id: string; stage: string; group?: string;
  homeTeamId: string | null; awayTeamId: string | null;
  homeScore: number | null; awayScore: number | null;
  status: string; winnerTeamId: string | null; kickoffAt: number;
};
export type TeamState = { alive: boolean; currentStage: string; eliminatedAt?: number };

const STAGE_ORDER = ["group", "r32", "r16", "qf", "sf", "third", "final"];
const isKnockout = (stage: string) => stage !== "group";

export function computeTeamStates(teams: TeamRow[], matches: MatchRow[]): Map<string, TeamState> {
  const states = new Map<string, TeamState>();
  for (const t of teams) states.set(t._id, { alive: true, currentStage: "group" });

  // latest stage a team appears in
  for (const mt of matches) {
    for (const id of [mt.homeTeamId, mt.awayTeamId]) {
      if (!id) continue;
      const st = states.get(id);
      if (!st) continue;
      if (STAGE_ORDER.indexOf(mt.stage) > STAGE_ORDER.indexOf(st.currentStage)) {
        st.currentStage = mt.stage;
      }
    }
  }

  const groupMatches = matches.filter((mt) => mt.stage === "group");
  const groupsDone = groupMatches.length > 0 && groupMatches.every((mt) => mt.status === "finished");
  const knockoutTeams = new Set<string>();
  for (const mt of matches) {
    if (isKnockout(mt.stage)) {
      if (mt.homeTeamId) knockoutTeams.add(mt.homeTeamId);
      if (mt.awayTeamId) knockoutTeams.add(mt.awayTeamId);
    }
  }

  // group teams absent from a populated bracket → out
  if (groupsDone && knockoutTeams.size > 0) {
    for (const t of teams) {
      if (!knockoutTeams.has(t._id)) {
        const st = states.get(t._id)!;
        st.alive = false;
        st.currentStage = "out";
      }
    }
  }

  // knockout losers → out; final winner → champion
  for (const mt of matches) {
    if (!isKnockout(mt.stage) || mt.status !== "finished" || !mt.winnerTeamId) continue;
    const loserId = mt.homeTeamId === mt.winnerTeamId ? mt.awayTeamId : mt.homeTeamId;
    if (loserId && states.has(loserId)) {
      const st = states.get(loserId)!;
      st.alive = false;
      st.currentStage = "out";
      st.eliminatedAt = mt.kickoffAt;
    }
    if (mt.stage === "final") {
      const st = states.get(mt.winnerTeamId)!;
      st.currentStage = "champion";
      st.alive = true;
    }
  }
  return states;
}

export function computeGroupStandings(group: string, teams: TeamRow[], matches: MatchRow[]) {
  const inGroup = teams.filter((t) => t.group === group);
  const stat = new Map(inGroup.map((t) => [t._id, { teamId: t._id, points: 0, gf: 0, ga: 0 }]));
  for (const mt of matches) {
    if (mt.stage !== "group" || mt.status !== "finished") continue;
    const h = mt.homeTeamId && stat.get(mt.homeTeamId);
    const a = mt.awayTeamId && stat.get(mt.awayTeamId);
    if (!h || !a || mt.homeScore == null || mt.awayScore == null) continue;
    h.gf += mt.homeScore; h.ga += mt.awayScore;
    a.gf += mt.awayScore; a.ga += mt.homeScore;
    if (mt.homeScore > mt.awayScore) h.points += 3;
    else if (mt.homeScore < mt.awayScore) a.points += 3;
    else { h.points += 1; a.points += 1; }
  }
  return [...stat.values()]
    .map((s) => ({ ...s, gd: s.gf - s.ga }))
    .sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf);
}
