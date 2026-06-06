// convex/lib/resolve.test.ts
import { describe, it, expect } from "vitest";
import { effectiveMatches, championTeamId, type OverrideRow } from "./resolve";
import { computeTeamStates, type MatchRow, type TeamRow } from "./tournament";

const m = (over: Partial<MatchRow> & { _id: string }): MatchRow => ({
  stage: "group", group: "A", homeTeamId: null, awayTeamId: null,
  homeScore: null, awayScore: null, status: "scheduled", winnerTeamId: null, kickoffAt: 0, ...over,
});

describe("effectiveMatches", () => {
  it("superpone el resultado del override sobre el partido global", () => {
    const matches = [m({ _id: "m1", homeTeamId: "t1", awayTeamId: "t2" })];
    const overrides: OverrideRow[] = [{ matchId: "m1", homeScore: 2, awayScore: 1, status: "finished", winnerTeamId: "t1" }];
    const [eff] = effectiveMatches(matches, overrides);
    expect([eff.homeScore, eff.awayScore, eff.status, eff.winnerTeamId]).toEqual([2, 1, "finished", "t1"]);
    expect(eff.homeTeamId).toBe("t1"); // equipos/etapa intactos
    expect(eff.stage).toBe("group");
  });

  it("deja intactos los partidos sin override", () => {
    const matches = [m({ _id: "m1" }), m({ _id: "m2" })];
    const out = effectiveMatches(matches, [{ matchId: "m1", homeScore: 1, awayScore: 0, status: "finished", winnerTeamId: null }]);
    expect(out[1]).toBe(matches[1]); // misma referencia
    expect(out[0].homeScore).toBe(1);
  });

  it("devuelve el arreglo original cuando no hay overrides", () => {
    const matches = [m({ _id: "m1" })];
    expect(effectiveMatches(matches, [])).toBe(matches);
  });
});

describe("championTeamId", () => {
  it("devuelve el equipo que ganó la final", () => {
    const teams: TeamRow[] = [{ _id: "t1", group: "A" }, { _id: "t2", group: "A" }];
    const states = computeTeamStates(teams, [m({ _id: "f", stage: "final", homeTeamId: "t1", awayTeamId: "t2", homeScore: 1, awayScore: 0, status: "finished", winnerTeamId: "t1" })]);
    expect(championTeamId(states)).toBe("t1");
  });

  it("devuelve null si la final no está decidida", () => {
    expect(championTeamId(computeTeamStates([{ _id: "t1", group: "A" }], []))).toBeNull();
  });
});
