// convex/lib/tournament.test.ts
import { describe, it, expect } from "vitest";
import { computeTeamStates, computeGroupStandings, computeQualifiers, type TeamRow, type MatchRow } from "./tournament";

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

  it("does NOT eliminate group teams while the first knockout round is still being seeded", () => {
    // Regresión (jun-2026, prod): la fase de grupos terminó pero la API solo había
    // colocado parte de los cruces de 16vos. Los clasificados cuyo cupo aún no se
    // sembró NO deben marcarse como eliminados.
    const teams = [team("a"), team("b"), team("c"), team("d")];
    const matches = [
      m({ stage: "group", homeTeamId: "a", awayTeamId: "b", status: "finished", homeScore: 1, awayScore: 0, winnerTeamId: "a" }),
      m({ stage: "group", homeTeamId: "c", awayTeamId: "d", status: "finished", homeScore: 2, awayScore: 1, winnerTeamId: "c" }),
      // bracket a medio sembrar: un partido con ambos equipos, otro todavía vacío
      m({ stage: "r32", group: undefined, homeTeamId: "a", awayTeamId: "c", status: "scheduled" }),
      m({ stage: "r32", group: undefined, homeTeamId: null, awayTeamId: null, status: "scheduled" }),
    ];
    const states = computeTeamStates(teams, matches);
    expect(states.get("a")!.alive).toBe(true);
    expect(states.get("c")!.alive).toBe(true);
    // b y d aún no están en el bracket, pero como no está completo siguen vivos
    expect(states.get("b")!.alive).toBe(true);
    expect(states.get("d")!.alive).toBe(true);
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

describe("computeQualifiers", () => {
  // Dos grupos de 3; gana el de más puntos. Resultados deterministas:
  // Grupo A: a1 > a2 > a3   |  Grupo B: b1 > b2 > b3
  const teams: TeamRow[] = [
    team("a1", "A"), team("a2", "A"), team("a3", "A"),
    team("b1", "B"), team("b2", "B"), team("b3", "B"),
  ];
  const fin = (h: string, a: string, hs: number, as: number, g: string): MatchRow =>
    m({ stage: "group", group: g, homeTeamId: h, awayTeamId: a, status: "finished",
        homeScore: hs, awayScore: as, winnerTeamId: hs > as ? h : as > hs ? a : null });
  const matches = [
    // Grupo A: a1 6pts, a2 3pts (gd menor), a3 0pts
    fin("a1", "a2", 1, 0, "A"), fin("a1", "a3", 5, 0, "A"), fin("a2", "a3", 1, 0, "A"),
    // Grupo B: b1 6pts, b2 3pts (gd mayor que a2), b3 0pts
    fin("b1", "b2", 1, 0, "B"), fin("b1", "b3", 2, 0, "B"), fin("b2", "b3", 4, 0, "B"),
  ];

  it("clasifica al 1º y 2º de cada grupo", () => {
    const q = computeQualifiers(teams, matches, 0);
    expect(q.has("a1")).toBe(true);
    expect(q.has("a2")).toBe(true);
    expect(q.has("b1")).toBe(true);
    expect(q.has("b2")).toBe(true);
    expect(q.has("a3")).toBe(false);
    expect(q.has("b3")).toBe(false);
  });

  it("clasifica solo a los mejores N terceros y excluye al resto", () => {
    // a3: 0pts gd=-6 ; b3: 0pts gd=-6 gf=0 — empatados; ninguno califica con thirds=0,
    // pero con thirds=1 entra exactamente uno (el de mejor gd/gf). Usamos un tercero
    // claramente mejor para que el orden sea inequívoco.
    const teams2 = [...teams, team("c1", "C"), team("c2", "C"), team("c3", "C")];
    const matches2 = [
      ...matches,
      // Grupo C: c3 termina 3º con 3 pts (mejor que a3/b3 con 0) → debe ser el mejor tercero
      fin("c1", "c2", 1, 0, "C"), fin("c1", "c3", 1, 0, "C"), fin("c3", "c2", 3, 0, "C"),
    ];
    const q = computeQualifiers(teams2, matches2, 1);
    expect(q.has("c3")).toBe(true);  // mejor tercero (3 pts) clasifica
    expect(q.has("a3")).toBe(false); // terceros peores quedan fuera
    expect(q.has("b3")).toBe(false);
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
