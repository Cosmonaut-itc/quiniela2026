// Integración con API-Football (api-sports.io v3) para alineaciones en vivo.
// Espejo de lib/footballData.ts: mappers puros + helpers de fetch con FetchDeps.

// Alias curados para nombres que la normalización no reconcilia sola.
// Clave y valor se comparan YA normalizados (sin sufijo/acentos/puntuación).
const TEAM_ALIASES: Record<string, string> = {
  "man city": "manchester city",
  "man united": "manchester united",
  "man utd": "manchester united",
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
