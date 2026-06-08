// convex/lib/footballData.ts
// Maps football-data.org /competitions/WC responses to our internal ApiMatch shape.
const STAGE: Record<string, string> = {
  GROUP_STAGE: "group", LAST_32: "r32", LAST_16: "r16",
  QUARTER_FINALS: "qf", SEMI_FINALS: "sf", THIRD_PLACE: "third", FINAL: "final",
};
const STATUS: Record<string, string> = {
  SCHEDULED: "scheduled", TIMED: "scheduled", IN_PLAY: "live", PAUSED: "live",
  FINISHED: "finished",
  // AWARDED: resultado otorgado (walkover) — trae marcador/ganador, cuenta como finalizado.
  AWARDED: "finished",
  // CANCELLED: no se jugará. Lo tratamos como "finished" sin marcador; standings,
  // bracket, lastResult y avisos ya exigen marcador/ganador, así que no contamina
  // nada y no bloquea el cierre de la fase de grupos.
  CANCELLED: "finished",
  SUSPENDED: "scheduled", POSTPONED: "scheduled",
};

export type ApiMatch = {
  externalId: string; stage: string; group: string | null;
  homeExternalId: string | null; awayExternalId: string | null;
  kickoffAt: number; homeScore: number | null; awayScore: number | null;
  status: string; winnerExternalId: string | null; bracketSlot: string | null;
};

// Minimal shape of the football-data.org /matches payload. Fields are optional
// because the upstream API omits scores/teams for unplayed knockout fixtures.
type RawTeam = { id?: number | string | null };
type RawScore = {
  winner?: string | null;
  fullTime?: { home?: number | null; away?: number | null };
};
type RawMatch = {
  id: number | string;
  stage?: string;
  group?: string | null;
  utcDate?: string;
  status?: string;
  homeTeam?: RawTeam | null;
  awayTeam?: RawTeam | null;
  score?: RawScore | null;
};
type RawResponse = { matches?: RawMatch[] };

export function mapMatches(json: RawResponse): ApiMatch[] {
  const list = json.matches ?? [];
  // Knockout slots are numbered per-stage (r32-1..r32-16, r16-1..r16-8, …) so
  // they match the committed snapshot convention — not the global match index.
  const stageCounters = new Map<string, number>();
  return list.map((m): ApiMatch => {
    const stage = (m.stage ? STAGE[m.stage] : undefined) ?? "group";
    const homeExternalId = m.homeTeam?.id ? String(m.homeTeam.id) : null;
    const awayExternalId = m.awayTeam?.id ? String(m.awayTeam.id) : null;
    const w = m.score?.winner;
    const winnerExternalId =
      w === "HOME_TEAM" ? homeExternalId : w === "AWAY_TEAM" ? awayExternalId : null;
    let bracketSlot: string | null = null;
    if (stage !== "group") {
      const n = (stageCounters.get(stage) ?? 0) + 1;
      stageCounters.set(stage, n);
      bracketSlot = `${stage}-${n}`;
    }
    return {
      externalId: String(m.id),
      stage,
      group: m.group ? String(m.group).replace("GROUP_", "") : null,
      homeExternalId,
      awayExternalId,
      kickoffAt: m.utcDate ? Date.parse(m.utcDate) : NaN,
      homeScore: m.score?.fullTime?.home ?? null,
      awayScore: m.score?.fullTime?.away ?? null,
      status: (m.status ? STATUS[m.status] : undefined) ?? "scheduled",
      winnerExternalId,
      bracketSlot,
    };
  });
}

const WC_MATCHES_URL = "https://api.football-data.org/v4/competitions/WC/matches";
const MAX_RETRY_WAIT_MS = 60_000;
const DEFAULT_BACKOFF_MS = 1_000;

/** Espera (en ms) a respetar tras un 429, leída del header `Retry-After` (segundos).
 *  Topada a 60s; si el header falta o es inválido, usa un backoff por defecto. */
export function retryAfterMs(header: string | null | undefined): number {
  const secs = Number(header);
  if (!Number.isFinite(secs) || secs <= 0) return DEFAULT_BACKOFF_MS;
  return Math.min(Math.ceil(secs) * 1000, MAX_RETRY_WAIT_MS);
}

type FetchDeps = {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export async function fetchMatches(token: string, deps: FetchDeps = {}): Promise<ApiMatch[]> {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const request = () => fetchFn(WC_MATCHES_URL, { headers: { "X-Auth-Token": token } });

  let res = await request();
  if (res.status === 429) {
    // Rate limit: espera lo que pida el servidor y reintenta una sola vez. Si
    // vuelve a fallar, lanza y el cron (cada 5 min) lo reintenta más tarde.
    await sleep(retryAfterMs(res.headers.get("Retry-After")));
    res = await request();
  }
  if (!res.ok) throw new Error(`football-data ${res.status}`);
  return mapMatches(await res.json());
}

// Fallback note: for API-Football, swap fetch URL to
// https://v3.football.api-sports.io/fixtures?league=1&season=2026 with header
// { "x-apisports-key": token } and map fixture.id/teams/goals/fixture.status.short accordingly.
