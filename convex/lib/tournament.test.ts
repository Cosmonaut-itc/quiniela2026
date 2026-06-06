// convex/lib/tournament.test.ts
import { describe, it, expect } from "vitest";
import { computeTeamStates, computeGroupStandings, type TeamRow, type MatchRow } from "./tournament";

const team = (id: string, group = "A"): TeamRow => ({ _id: id, group });
const m = (p: Partial<MatchRow>): MatchRow => ({
  _id: "x", stage: "group", group: "A", homeTeamId: null, awayTeamId: null,
  homeScore: null, awayScore: null, status: "scheduled", winnerTeamId: null,
  kickoffAt: 0, ...p,
});

describe("computeTeamStates", () => {
  it("keeps everyone alive during an unfinished group stage", () => {
    const teams = [team("a"), team("b")];
    const matches = [m({ homeTeamId: "a", awayTeamId: "b", status: "scheduled" })];
    const states = computeTeamStates(teams, matches);
    expect(states.get("a")!.alive).toBe(true);
    expect(states.get("b")!.alive).toBe(true);
  });

  it("eliminates group teams absent from the bracket once groups are done", () => {
    const teams = [team("a"), team("b"), team("c"), team("d")];
    const matches = [
      m({ stage: "group", homeTeamId: "a", awayTeamId: "b", status: "finished", homeScore: 1, awayScore: 0, winnerTeamId: "a" }),
      m({ stage: "group", homeTeamId: "c", awayTeamId: "d", status: "finished", homeScore: 2, awayScore: 2, winnerTeamId: null }),
      // bracket populated with a & c only
      m({ stage: "r32", group: undefined, homeTeamId: "a", awayTeamId: "c", status: "scheduled" }),
    ];
    const states = computeTeamStates(teams, matches);
    expect(states.get("a")!.alive).toBe(true);
    expect(states.get("c")!.alive).toBe(true);
    expect(states.get("b")!.alive).toBe(false);
    expect(states.get("d")!.alive).toBe(false);
  });

  it("eliminates the loser of a finished knockout match", () => {
    const teams = [team("a"), team("c")];
    const matches = [
      m({ stage: "r32", group: undefined, homeTeamId: "a", awayTeamId: "c", status: "finished", homeScore: 0, awayScore: 1, winnerTeamId: "c", kickoffAt: 100 }),
    ];
    const states = computeTeamStates(teams, matches);
    expect(states.get("c")!.alive).toBe(true);
    expect(states.get("a")!.alive).toBe(false);
    expect(states.get("a")!.eliminatedAt).toBe(100);
  });

  it("crowns the winner of the final as champion", () => {
    const teams = [team("a"), team("c")];
    const matches = [
      m({ stage: "final", group: undefined, homeTeamId: "a", awayTeamId: "c", status: "finished", homeScore: 2, awayScore: 1, winnerTeamId: "a" }),
    ];
    const states = computeTeamStates(teams, matches);
    expect(states.get("a")!.currentStage).toBe("champion");
    expect(states.get("a")!.alive).toBe(true);
    expect(states.get("c")!.alive).toBe(false);
  });
});

describe("computeGroupStandings", () => {
  it("orders by points then goal difference (display only)", () => {
    const teams = [team("a"), team("b")];
    const matches = [
      m({ homeTeamId: "a", awayTeamId: "b", status: "finished", homeScore: 3, awayScore: 0, winnerTeamId: "a" }),
    ];
    const rows = computeGroupStandings("A", teams, matches);
    expect(rows[0].teamId).toBe("a");
    expect(rows[0].points).toBe(3);
    expect(rows[0].gd).toBe(3);
    expect(rows[1].teamId).toBe("b");
  });
});
