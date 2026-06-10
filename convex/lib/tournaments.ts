// Catálogo de Torneos (ADR-0001): las competiciones del free tier de
// football-data.org, declaradas en código porque formato y nombre corto
// requieren curaduría y cambian ~1 vez al año.
import type { GameMode } from "../types";

export type TournamentFormat = "eliminatorio" | "liga";

export type Tournament = {
  code: string;        // código football-data (path de la API)
  name: string;        // nombre completo para el selector
  shortName: string;   // label del tab Vista Torneo
  format: TournamentFormat;
};

export const TOURNAMENTS: readonly Tournament[] = [
  { code: "WC",  name: "Copa del Mundo 2026",      shortName: "Mundial",     format: "eliminatorio" },
  { code: "CL",  name: "UEFA Champions League",    shortName: "Champions",   format: "eliminatorio" },
  { code: "EC",  name: "Eurocopa",                 shortName: "Euro",        format: "eliminatorio" },
  { code: "PL",  name: "Premier League",           shortName: "Premier",     format: "liga" },
  { code: "PD",  name: "La Liga",                  shortName: "La Liga",     format: "liga" },
  { code: "SA",  name: "Serie A",                  shortName: "Serie A",     format: "liga" },
  { code: "BL1", name: "Bundesliga",               shortName: "Bundesliga",  format: "liga" },
  { code: "FL1", name: "Ligue 1",                  shortName: "Ligue 1",     format: "liga" },
  { code: "DED", name: "Eredivisie",               shortName: "Eredivisie",  format: "liga" },
  { code: "PPL", name: "Primeira Liga",            shortName: "Primeira",    format: "liga" },
  { code: "ELC", name: "Championship",             shortName: "Championship", format: "liga" },
  { code: "BSA", name: "Brasileirão",              shortName: "Brasileirão", format: "liga" },
];

export function tournamentByCode(code: string): Tournament | undefined {
  return TOURNAMENTS.find((t) => t.code === code);
}

/** Clásica exige eliminación real (CONTEXT.md); las ligas solo admiten Progol. */
export function allowedGameModes(format: TournamentFormat): GameMode[] {
  return format === "eliminatorio" ? ["clasica", "progol"] : ["progol"];
}

/** Normaliza filas legacy: sin tournamentCode = Mundial (pre multi-torneo). */
export function tournamentCodeOf(doc: { tournamentCode?: string }): string {
  return doc.tournamentCode ?? "WC";
}
