// convex/lib/standings.test.ts
import { describe, expect, it } from "vitest";
import { computeLeagueStandings } from "./standings";
import type { MatchRow, TeamRow } from "./tournament";

const team = (id: string): TeamRow => ({ _id: id, group: "" });
const match = (h: string, a: string, hs: number | null, as: number | null, status = "finished"): MatchRow => ({
  _id: `${h}-${a}`, stage: "league", homeTeamId: h, awayTeamId: a,
  homeScore: hs, awayScore: as, status, winnerTeamId: null, kickoffAt: 0,
});

describe("computeLeagueStandings", () => {
  it("3 puntos por victoria, 1 por empate; ordena por pts, dif, gf", () => {
    const rows = computeLeagueStandings(
      [team("ARS"), team("CHE"), team("LIV")],
      [
        match("ARS", "CHE", 2, 0), // ARS 3pts (+2), CHE 0 (-2)
        match("LIV", "ARS", 1, 1), // LIV 1, ARS 4
        match("CHE", "LIV", 0, 3), // LIV 4 (+3) — desempata a ARS (+2) por diferencia
      ],
    );
    expect(rows.map((r) => r.teamId)).toEqual(["LIV", "ARS", "CHE"]);
    expect(rows[0]).toMatchObject({ points: 4, gd: 3, gf: 4, played: 2 });
    expect(rows[1]).toMatchObject({ points: 4, gd: 2, gf: 3, played: 2 });
  });

  it("a igualdad de puntos y diferencia, ordena por goles a favor", () => {
    const rows = computeLeagueStandings(
      [team("A"), team("B"), team("C"), team("D")],
      [
        match("A", "B", 2, 2), // A y B: 1pt, dif 0, gf 2
        match("C", "D", 0, 0), // C y D: 1pt, dif 0, gf 0
      ],
    );
    expect(rows.slice(0, 2).map((r) => r.teamId).sort()).toEqual(["A", "B"]);
  });

  it("ignora partidos sin terminar y sin marcador", () => {
    const rows = computeLeagueStandings([team("ARS")], [match("ARS", "CHE", null, null, "scheduled")]);
    expect(rows[0]).toMatchObject({ points: 0, played: 0 });
  });

  it("ignora partidos con equipos fuera de la lista", () => {
    const rows = computeLeagueStandings([team("ARS")], [match("ARS", "GHOST", 1, 0)]);
    expect(rows[0]).toMatchObject({ points: 0, played: 0 });
  });
});
