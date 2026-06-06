// convex/lib/footballData.ts
// Maps football-data.org /competitions/WC responses to our internal ApiMatch shape.
const STAGE: Record<string, string> = {
  GROUP_STAGE: "group", LAST_32: "r32", LAST_16: "r16",
  QUARTER_FINALS: "qf", SEMI_FINALS: "sf", THIRD_PLACE: "third", FINAL: "final",
};
const STATUS: Record<string, string> = {
  SCHEDULED: "scheduled", TIMED: "scheduled", IN_PLAY: "live", PAUSED: "live",
  FINISHED: "finished", SUSPENDED: "scheduled", POSTPONED: "scheduled",
};

export type ApiMatch = {
  externalId: string; stage: string; group: string | null;
  homeExternalId: string | null; awayExternalId: string | null;
  kickoffAt: number; homeScore: number | null; awayScore: number | null;
  status: string; winnerExternalId: string | null; bracketSlot: string | null;
};

export function mapMatches(json: any): ApiMatch[] {
  const list = json.matches ?? [];
  return list.map((m: any, i: number): ApiMatch => {
    const stage = STAGE[m.stage] ?? "group";
    const homeExternalId = m.homeTeam?.id ? String(m.homeTeam.id) : null;
    const awayExternalId = m.awayTeam?.id ? String(m.awayTeam.id) : null;
    const w = m.score?.winner;
    const winnerExternalId =
      w === "HOME_TEAM" ? homeExternalId : w === "AWAY_TEAM" ? awayExternalId : null;
    return {
      externalId: String(m.id),
      stage,
      group: m.group ? String(m.group).replace("GROUP_", "") : null,
      homeExternalId,
      awayExternalId,
      kickoffAt: Date.parse(m.utcDate),
      homeScore: m.score?.fullTime?.home ?? null,
      awayScore: m.score?.fullTime?.away ?? null,
      status: STATUS[m.status] ?? "scheduled",
      winnerExternalId,
      bracketSlot: stage === "group" ? null : `${stage}-${i}`,
    };
  });
}

export async function fetchMatches(token: string): Promise<ApiMatch[]> {
  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": token },
  });
  if (!res.ok) throw new Error(`football-data ${res.status}`);
  return mapMatches(await res.json());
}

// Fallback note: for API-Football, swap fetch URL to
// https://v3.football.api-sports.io/fixtures?league=1&season=2026 with header
// { "x-apisports-key": token } and map fixture.id/teams/goals/fixture.status.short accordingly.
