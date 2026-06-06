// convex/lib/footballData.test.ts
import { describe, it, expect } from "vitest";
import { mapMatches } from "./footballData";

describe("mapMatches", () => {
  it("maps stage, group, status and scores", () => {
    const out = mapMatches({ matches: [{
      id: 101, stage: "GROUP_STAGE", group: "GROUP_C",
      utcDate: "2026-06-13T18:00:00Z", status: "FINISHED",
      homeTeam: { id: 764 }, awayTeam: { id: 770 },
      score: { winner: "HOME_TEAM", fullTime: { home: 2, away: 0 } },
    }] });
    expect(out[0]).toMatchObject({
      externalId: "101", stage: "group", group: "C", status: "finished",
      homeExternalId: "764", awayExternalId: "770", homeScore: 2, awayScore: 0,
      winnerExternalId: "764",
    });
    expect(out[0].kickoffAt).toBe(Date.parse("2026-06-13T18:00:00Z"));
  });
  it("marks knockout TBD teams as null", () => {
    const out = mapMatches({ matches: [{ id: 9, stage: "FINAL", utcDate: "2026-07-19T19:00:00Z", status: "SCHEDULED", homeTeam: { id: null }, awayTeam: { id: null }, score: { fullTime: {} } }] });
    expect(out[0].stage).toBe("final");
    expect(out[0].homeExternalId).toBeNull();
    expect(out[0].winnerExternalId).toBeNull();
  });
  it("uses score.winner so a penalty draw still names a winner", () => {
    const out = mapMatches({ matches: [{
      id: 555, stage: "LAST_16", utcDate: "2026-07-01T18:00:00Z", status: "FINISHED",
      homeTeam: { id: 1 }, awayTeam: { id: 2 },
      score: { winner: "AWAY_TEAM", duration: "PENALTY_SHOOTOUT", fullTime: { home: 1, away: 1 } },
    }] });
    expect(out[0].homeScore).toBe(1);
    expect(out[0].awayScore).toBe(1);
    expect(out[0].winnerExternalId).toBe("2"); // away wins on penalties
  });
  it("numbers bracket slots per stage, not by global match index", () => {
    const out = mapMatches({ matches: [
      { id: 1, stage: "GROUP_STAGE", group: "GROUP_A", utcDate: "2026-06-11T16:00:00Z", status: "SCHEDULED", homeTeam: { id: 10 }, awayTeam: { id: 11 }, score: { fullTime: {} } },
      { id: 2, stage: "LAST_32", utcDate: "2026-06-28T16:00:00Z", status: "SCHEDULED", homeTeam: { id: null }, awayTeam: { id: null }, score: { fullTime: {} } },
      { id: 3, stage: "LAST_32", utcDate: "2026-06-28T20:00:00Z", status: "SCHEDULED", homeTeam: { id: null }, awayTeam: { id: null }, score: { fullTime: {} } },
      { id: 4, stage: "FINAL", utcDate: "2026-07-19T19:00:00Z", status: "SCHEDULED", homeTeam: { id: null }, awayTeam: { id: null }, score: { fullTime: {} } },
    ] });
    expect(out[0].bracketSlot).toBeNull(); // group has no slot
    expect(out[1].bracketSlot).toBe("r32-1"); // per-stage 1-based, not global index 1
    expect(out[2].bracketSlot).toBe("r32-2"); // not global index 2
    expect(out[3].bracketSlot).toBe("final-1"); // first (and only) final, not global index 3
  });
});
