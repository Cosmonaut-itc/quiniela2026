import { describe, it, expect } from "vitest";
import {
  matchResult, isPredictable, matchUiState, leaderboard,
  unlockedKnockoutStages, detectProgolEvents, isSeasonDone,
} from "./progol";
import type { MatchRow } from "./tournament";

const m = (p: Partial<MatchRow>): MatchRow => ({
  _id: "x", stage: "group", group: "A", homeTeamId: "h", awayTeamId: "a",
  homeScore: null, awayScore: null, status: "scheduled", winnerTeamId: null,
  kickoffAt: 1000, ...p,
});

describe("matchResult", () => {
  it("devuelve home/away/draw por marcador de un partido terminado", () => {
    expect(matchResult(m({ status: "finished", homeScore: 2, awayScore: 1 }))).toBe("home");
    expect(matchResult(m({ status: "finished", homeScore: 0, awayScore: 3 }))).toBe("away");
    expect(matchResult(m({ status: "finished", homeScore: 1, awayScore: 1 }))).toBe("draw");
  });
  it("penales = empate (marcador parejo aunque haya clasificado)", () => {
    expect(matchResult(m({ stage: "r32", status: "finished", homeScore: 1, awayScore: 1, winnerTeamId: "h" }))).toBe("draw");
  });
  it("null si no terminó o falta marcador", () => {
    expect(matchResult(m({ status: "scheduled" }))).toBeNull();
    expect(matchResult(m({ status: "finished", homeScore: null, awayScore: 2 }))).toBeNull();
  });
});

describe("isPredictable / matchUiState", () => {
  it("predecible solo con ambos equipos, scheduled y antes del saque", () => {
    expect(isPredictable(m({ kickoffAt: 2000 }), 1000)).toBe(true);
    expect(isPredictable(m({ kickoffAt: 500 }), 1000)).toBe(false); // ya empezó
    expect(isPredictable(m({ homeTeamId: null }), 1000)).toBe(false); // sin rival
  });
  it("estados UI: pending/predictable/locked/finished", () => {
    expect(matchUiState(m({ homeTeamId: null, awayTeamId: null }), 1000)).toBe("pending");
    expect(matchUiState(m({ kickoffAt: 2000 }), 1000)).toBe("predictable");
    expect(matchUiState(m({ kickoffAt: 500, status: "live" }), 1000)).toBe("locked");
    expect(matchUiState(m({ status: "finished", homeScore: 1, awayScore: 0 }), 1000)).toBe("finished");
  });
});

describe("leaderboard", () => {
  it("puntos = aciertos; played = partidos definidos pronosticados; empates comparten rank", () => {
    const participants = [{ id: "A" }, { id: "B" }, { id: "C" }];
    const results = new Map([["m1", "home"], ["m2", "draw"]] as const);
    const picks = [
      { participantId: "A", matchId: "m1", pick: "home" as const }, // ✓
      { participantId: "A", matchId: "m2", pick: "draw" as const }, // ✓
      { participantId: "B", matchId: "m1", pick: "home" as const }, // ✓
      { participantId: "B", matchId: "m2", pick: "away" as const }, // ✗
      // C no pronosticó nada
    ];
    const rows = leaderboard(participants, picks, results);
    const byId = Object.fromEntries(rows.map((r) => [r.participantId, r]));
    expect(byId["A"].points).toBe(2);
    expect(byId["A"].played).toBe(2);
    expect(byId["B"].points).toBe(1);
    expect(byId["B"].played).toBe(2);
    expect(byId["C"].points).toBe(0);
    expect(byId["C"].played).toBe(0);
    expect(byId["A"].rank).toBe(1);
    expect(byId["B"].rank).toBe(2);
    expect(byId["C"].rank).toBe(3);
  });
  it("dos líderes empatados comparten el rank 1", () => {
    const results = new Map([["m1", "home"]] as const);
    const rows = leaderboard(
      [{ id: "A" }, { id: "B" }],
      [
        { participantId: "A", matchId: "m1", pick: "home" as const },
        { participantId: "B", matchId: "m1", pick: "home" as const },
      ],
      results,
    );
    expect(rows.every((r) => r.rank === 1)).toBe(true);
  });
});

describe("isSeasonDone", () => {
  const sm = (stage: string, status: string) => ({ stage, status });
  it("eliminatorio: termina cuando la final está finished", () => {
    expect(isSeasonDone("eliminatorio", [sm("group", "finished"), sm("final", "finished")])).toBe(true);
    expect(isSeasonDone("eliminatorio", [sm("final", "scheduled")])).toBe(false);
  });
  it("liga: termina cuando TODOS los partidos están finished y hay al menos uno", () => {
    expect(isSeasonDone("liga", [sm("league", "finished"), sm("league", "finished")])).toBe(true);
    expect(isSeasonDone("liga", [sm("league", "finished"), sm("league", "scheduled")])).toBe(false);
    expect(isSeasonDone("liga", [])).toBe(false);
  });
});

describe("unlockedKnockoutStages", () => {
  it("ignora grupos y lista etapas de eliminatoria con ambos equipos definidos, ordenadas", () => {
    const ms = [
      { stage: "group", homeTeamId: "a", awayTeamId: "b" },
      { stage: "r16", homeTeamId: "a", awayTeamId: "b" },
      { stage: "r32", homeTeamId: "a", awayTeamId: "b" },
      { stage: "qf", homeTeamId: "a", awayTeamId: null }, // sin rival → no cuenta
    ];
    expect(unlockedKnockoutStages(ms)).toEqual(["r32", "r16"]);
  });
});

describe("detectProgolEvents", () => {
  it("emite tournament_started y predictions_unlocked por etapa, con dedupeKey por participante", () => {
    const intents = detectProgolEvents({
      quinielaId: "q1", tournamentStarted: true,
      effMatches: [{ stage: "r32", homeTeamId: "a", awayTeamId: "b" }],
      participants: [{ id: "P1" }, { id: "P2" }],
    });
    const types = intents.map((i) => i.type);
    expect(types.filter((t) => t === "tournament_started")).toHaveLength(2);
    expect(types.filter((t) => t === "predictions_unlocked")).toHaveLength(2);
    expect(intents.find((i) => i.type === "predictions_unlocked" && i.participantId === "P1")!.dedupeKey)
      .toBe("q1:predictions_unlocked:r32:P1");
  });
  it("sin torneo iniciado y sin eliminatorias no emite nada", () => {
    expect(detectProgolEvents({
      quinielaId: "q1", tournamentStarted: false,
      effMatches: [{ stage: "group", homeTeamId: "a", awayTeamId: "b" }],
      participants: [{ id: "P1" }],
    })).toHaveLength(0);
  });
});
