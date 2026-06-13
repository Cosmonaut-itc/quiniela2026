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
