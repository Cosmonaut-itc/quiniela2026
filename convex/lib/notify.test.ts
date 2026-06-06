// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import {
  detectSyncEvents, teamsAssignedNotice, quinielaClosedNotice,
  playerJoinedNotice, readyToDistributeNotice,
} from "./notify";
import type { MatchRow, TeamState } from "./tournament";

const SOON = 65 * 60_000;
const tById = () => new Map([
  ["t1", { id: "t1", name: "México", flag: "🇲🇽" }],
  ["t2", { id: "t2", name: "EE.UU.", flag: "🇺🇸" }],
]);
const finishedMatch = (winner: string | null): MatchRow => ({
  _id: "m1", stage: "group", group: "A", homeTeamId: "t1", awayTeamId: "t2",
  homeScore: 2, awayScore: 1, status: "finished", winnerTeamId: winner, kickoffAt: 0,
});
const alive = (stage = "group"): TeamState => ({ alive: true, currentStage: stage });
const out = (): TeamState => ({ alive: false, currentStage: "out", eliminatedAt: 1 });

describe("detectSyncEvents", () => {
  it("emite match_result al dueño de cada equipo del partido terminado", () => {
    const intents = detectSyncEvents({
      quinielaId: "Q", now: 10_000, soonMs: SOON, tournamentStarted: false,
      teamById: tById(), effMatches: [finishedMatch("t1")],
      states: new Map([["t1", alive()], ["t2", alive()]]),
      ownerByTeam: new Map([["t1", "p1"], ["t2", "p2"]]),
      participants: [{ id: "p1", teamCount: 1 }, { id: "p2", teamCount: 1 }],
    });
    const results = intents.filter((i) => i.type === "match_result");
    expect(results).toHaveLength(2);
    expect(results.find((i) => i.participantId === "p1")!.title).toContain("ganó");
    expect(results.find((i) => i.participantId === "p2")!.title).toContain("perdió");
    expect(results[0].quinielaId).toBe("Q");
  });

  it("no emite nada para partidos sin dueño", () => {
    const intents = detectSyncEvents({
      quinielaId: "Q", now: 10_000, soonMs: SOON, tournamentStarted: false,
      teamById: tById(), effMatches: [finishedMatch("t1")],
      states: new Map([["t1", alive()], ["t2", alive()]]),
      ownerByTeam: new Map(), participants: [],
    });
    expect(intents).toHaveLength(0);
  });

  it("emite match_soon dentro de la ventana, no fuera", () => {
    const scheduled = (kickoffAt: number): MatchRow => ({
      _id: "m1", stage: "r16", group: undefined, homeTeamId: "t1", awayTeamId: "t2",
      homeScore: null, awayScore: null, status: "scheduled", winnerTeamId: null, kickoffAt,
    });
    const base = {
      quinielaId: "Q", soonMs: SOON, tournamentStarted: false, teamById: tById(),
      states: new Map([["t1", alive("r16")], ["t2", alive("r16")]]),
      ownerByTeam: new Map([["t1", "p1"], ["t2", "p2"]]),
      participants: [{ id: "p1", teamCount: 1 }, { id: "p2", teamCount: 1 }],
    };
    const now = 1_000_000;
    const within = detectSyncEvents({ ...base, now, effMatches: [scheduled(now + 30 * 60_000)] });
    expect(within.filter((i) => i.type === "match_soon")).toHaveLength(2);
    const far = detectSyncEvents({ ...base, now, effMatches: [scheduled(now + 5 * 3600_000)] });
    expect(far.filter((i) => i.type === "match_soon")).toHaveLength(0);
  });

  it("emite team_eliminated por equipo fuera y disqualified si no le queda ninguno vivo", () => {
    const intents = detectSyncEvents({
      quinielaId: "Q", now: 10_000, soonMs: SOON, tournamentStarted: false,
      teamById: tById(), effMatches: [],
      states: new Map([["t1", out()], ["t2", out()]]),
      ownerByTeam: new Map([["t1", "p1"], ["t2", "p1"]]),
      participants: [{ id: "p1", teamCount: 2 }],
    });
    expect(intents.filter((i) => i.type === "team_eliminated")).toHaveLength(2);
    expect(intents.filter((i) => i.type === "disqualified")).toHaveLength(1);
  });

  it("emite champion_won al dueño del campeón (y no lo descalifica)", () => {
    const intents = detectSyncEvents({
      quinielaId: "Q", now: 10_000, soonMs: SOON, tournamentStarted: false,
      teamById: tById(), effMatches: [],
      states: new Map([["t1", { alive: true, currentStage: "champion" }], ["t2", out()]]),
      ownerByTeam: new Map([["t1", "p1"], ["t2", "p2"]]),
      participants: [{ id: "p1", teamCount: 1 }, { id: "p2", teamCount: 1 }],
    });
    expect(intents.filter((i) => i.type === "champion_won")).toHaveLength(1);
    expect(intents.find((i) => i.type === "champion_won")!.participantId).toBe("p1");
    expect(intents.filter((i) => i.type === "disqualified" && i.participantId === "p1")).toHaveLength(0);
  });

  it("tournament_started va a todos los participantes", () => {
    const intents = detectSyncEvents({
      quinielaId: "Q", now: 10_000, soonMs: SOON, tournamentStarted: true,
      teamById: tById(), effMatches: [], states: new Map(),
      ownerByTeam: new Map([["t1", "p1"]]),
      participants: [{ id: "p1", teamCount: 1 }, { id: "p2", teamCount: 0 }],
    });
    expect(intents.filter((i) => i.type === "tournament_started")).toHaveLength(2);
  });
});

describe("constructores de copy", () => {
  it("teamsAssignedNotice usa singular/plural", () => {
    expect(teamsAssignedNotice("Q", "p1", 1).body).toContain("1 equipo");
    expect(teamsAssignedNotice("Q", "p1", 3).body).toContain("3 equipos");
  });
  it("playerJoinedNotice / readyToDistributeNotice van al admin", () => {
    expect(playerJoinedNotice("Q", "Ana", "p1").audience).toBe("admin");
    expect(readyToDistributeNotice("Q").audience).toBe("admin");
  });
  it("quinielaClosedNotice va al participante", () => {
    expect(quinielaClosedNotice("Q", "p1").audience).toBe("participant");
    expect(quinielaClosedNotice("Q", "p1").participantId).toBe("p1");
  });
});
