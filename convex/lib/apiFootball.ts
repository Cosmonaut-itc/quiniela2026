// Integración con API-Football (api-sports.io v3) para alineaciones en vivo.
// Espejo de lib/footballData.ts: mappers puros + helpers de fetch con FetchDeps.

// Alias curados para nombres que la normalización no reconcilia sola.
// Clave y valor se comparan YA normalizados (sin sufijo/acentos/puntuación).
const TEAM_ALIASES: Record<string, string> = {
  "man city": "manchester city",
  "man united": "manchester united",
  "man utd": "manchester united",
  // Selecciones: API-Football usa el nombre FIFA actual; nuestra semilla, el legacy.
  turkiye: "turkey", // "Türkiye" (de-acentuado) → "Turkey"
};

const CLUB_SUFFIXES = /\b(fc|cf|afc|sc|ac|cd|ssc|rc)\b/g;

/** Normaliza un nombre de equipo para comparar entre proveedores. */
export function normalizeTeamName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos
    .replace(/\./g, "") // quita puntos (p.ej. "A.F.C." → "AFC")
    .replace(/[-_']/g, " ")
    .replace(CLUB_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
  return TEAM_ALIASES[base] ?? base;
}

export type LiveFixture = {
  fixtureId: number; homeApiId: number | null; awayApiId: number | null;
  homeName: string; awayName: string;
};
export type MappedPlayer = { name: string; number?: number; pos?: string; grid?: string };
export type StoredTeamLineup = {
  name: string; formation: string; coach: string;
  startXI: MappedPlayer[]; bench: MappedPlayer[];
};
export type MappedTeamLineup = StoredTeamLineup & { apiTeamId: number | null };
export type StoredLineups = { home: StoredTeamLineup; away: StoredTeamLineup };

type RawFixture = {
  fixture?: { id?: number | null };
  teams?: { home?: { id?: number | null; name?: string }; away?: { id?: number | null; name?: string } };
};
type RawPlayer = { player?: { name?: string; number?: number | null; pos?: string | null; grid?: string | null } };
type RawLineupTeam = {
  team?: { id?: number | null; name?: string };
  formation?: string | null; coach?: { name?: string } | null;
  startXI?: RawPlayer[]; substitutes?: RawPlayer[];
};

export function mapLiveFixtures(json: { response?: RawFixture[] }): LiveFixture[] {
  return (json.response ?? [])
    .filter((f): f is RawFixture & { fixture: { id: number } } => typeof f.fixture?.id === "number")
    .map((f) => ({
      fixtureId: f.fixture.id,
      homeApiId: f.teams?.home?.id ?? null,
      awayApiId: f.teams?.away?.id ?? null,
      homeName: f.teams?.home?.name ?? "",
      awayName: f.teams?.away?.name ?? "",
    }));
}

function mapPlayer(p: RawPlayer): MappedPlayer {
  const pl = p.player ?? {};
  const out: MappedPlayer = { name: pl.name ?? "" };
  if (typeof pl.number === "number") out.number = pl.number;
  if (pl.pos) out.pos = pl.pos;
  if (pl.grid) out.grid = pl.grid;
  return out;
}

export function mapLineups(json: { response?: RawLineupTeam[] }): MappedTeamLineup[] {
  return (json.response ?? []).map((t) => ({
    apiTeamId: t.team?.id ?? null,
    name: t.team?.name ?? "",
    formation: t.formation ?? "",
    coach: t.coach?.name ?? "",
    startXI: (t.startXI ?? []).map(mapPlayer),
    bench: (t.substitutes ?? []).map(mapPlayer),
  }));
}

const strip = (t: MappedTeamLineup): StoredTeamLineup => ({
  name: t.name, formation: t.formation, coach: t.coach, startXI: t.startXI, bench: t.bench,
});

/** Asigna las dos alineaciones a home/away según los ids del fixture en vivo. */
export function orientLineups(teams: MappedTeamLineup[], fixture: LiveFixture): StoredLineups {
  const byId = (id: number | null) => teams.find((t) => t.apiTeamId != null && t.apiTeamId === id);
  const home = byId(fixture.homeApiId) ?? teams[0];
  const away = byId(fixture.awayApiId) ?? teams[1];
  const empty: StoredTeamLineup = { name: "", formation: "", coach: "", startXI: [], bench: [] };
  return { home: home ? strip(home) : empty, away: away ? strip(away) : empty };
}

/** El 11 está confirmado cuando AMBOS equipos ya publicaron titulares. */
export function isConfirmed(l: StoredLineups): boolean {
  return l.home.startXI.length > 0 && l.away.startXI.length > 0;
}

export type LiveMatchKey = { homeName: string; awayName: string; apiFixtureId: number | null };

/** Encuentra el fixture en vivo de API-Football que corresponde a un partido nuestro.
 *  Si ya hay apiFixtureId guardado, empareja por id (determinista); si no, por nombre
 *  normalizado de AMBOS equipos. Devuelve null si no hay coincidencia. */
export function matchLiveFixture(match: LiveMatchKey, fixtures: LiveFixture[]): LiveFixture | null {
  if (match.apiFixtureId != null) {
    return fixtures.find((f) => f.fixtureId === match.apiFixtureId) ?? null;
  }
  const home = normalizeTeamName(match.homeName);
  const away = normalizeTeamName(match.awayName);
  return (
    fixtures.find(
      (f) => normalizeTeamName(f.homeName) === home && normalizeTeamName(f.awayName) === away,
    ) ?? null
  );
}

const BASE = "https://v3.football.api-sports.io";
const MAX_RETRY_WAIT_MS = 60_000;
const DEFAULT_BACKOFF_MS = 1_000;

function retryAfterMs(header: string | null | undefined): number {
  const secs = Number(header);
  if (!Number.isFinite(secs) || secs <= 0) return DEFAULT_BACKOFF_MS;
  return Math.min(Math.ceil(secs) * 1000, MAX_RETRY_WAIT_MS);
}

type FetchDeps = { fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void> };

async function fetchJson(url: string, token: string, deps: FetchDeps): Promise<unknown> {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const request = () => fetchFn(url, { headers: { "x-apisports-key": token } });
  let res = await request();
  if (res.status === 429) {
    await sleep(retryAfterMs(res.headers.get("Retry-After")));
    res = await request();
  }
  if (!res.ok) throw new Error(`api-football ${res.status}`);
  return res.json();
}

export async function fetchLiveFixtures(token: string, deps: FetchDeps = {}): Promise<LiveFixture[]> {
  return mapLiveFixtures((await fetchJson(`${BASE}/fixtures?live=all`, token, deps)) as { response?: RawFixture[] });
}

export async function fetchLineups(token: string, fixtureId: number, deps: FetchDeps = {}): Promise<MappedTeamLineup[]> {
  return mapLineups((await fetchJson(`${BASE}/fixtures/lineups?fixture=${fixtureId}`, token, deps)) as { response?: RawLineupTeam[] });
}

/** Fixtures de una fecha (UTC, YYYY-MM-DD). Para descubrir el fixtureId de un
 *  partido que aún no empieza —no aparece en /fixtures?live=all—; misma forma de
 *  respuesta que los fixtures en vivo, así que reutiliza mapLiveFixtures. */
export async function fetchFixturesByDate(token: string, date: string, deps: FetchDeps = {}): Promise<LiveFixture[]> {
  return mapLiveFixtures((await fetchJson(`${BASE}/fixtures?date=${date}`, token, deps)) as { response?: RawFixture[] });
}
