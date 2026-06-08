import { describe, it, expect } from "vitest";
import { nextMatchFor, lastResultMatchFor } from "./matchSelect";

type M = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  kickoffAt: number;
};
const m = (p: Partial<M>): M => ({
  homeTeamId: "A", awayTeamId: "B", homeScore: null, awayScore: null,
  status: "scheduled", kickoffAt: 0, ...p,
});

describe("nextMatchFor", () => {
  it("elige el partido no finalizado más próximo del equipo", () => {
    const rows = [
      m({ homeTeamId: "A", kickoffAt: 300, status: "scheduled" }),
      m({ homeTeamId: "A", kickoffAt: 100, status: "scheduled" }),
      m({ awayTeamId: "A", kickoffAt: 200, status: "live" }),
    ];
    expect(nextMatchFor(rows, "A")!.kickoffAt).toBe(100);
  });

  it("excluye partidos finalizados (incluye cancelados, que mapean a finished)", () => {
    const rows = [
      m({ homeTeamId: "A", kickoffAt: 100, status: "finished", homeScore: 1, awayScore: 0 }),
      m({ homeTeamId: "A", kickoffAt: 999, status: "scheduled" }),
    ];
    expect(nextMatchFor(rows, "A")!.kickoffAt).toBe(999);
  });

  it("ignora partidos donde el equipo no juega", () => {
    const rows = [m({ homeTeamId: "X", awayTeamId: "Y", kickoffAt: 50 })];
    expect(nextMatchFor(rows, "A")).toBeUndefined();
  });
});

describe("lastResultMatchFor", () => {
  it("elige el finalizado CON marcador más reciente del equipo", () => {
    const rows = [
      m({ homeTeamId: "A", kickoffAt: 100, status: "finished", homeScore: 1, awayScore: 0 }),
      m({ awayTeamId: "A", kickoffAt: 300, status: "finished", homeScore: 2, awayScore: 2 }),
    ];
    expect(lastResultMatchFor(rows, "A")!.kickoffAt).toBe(300);
  });

  it("excluye finalizados SIN marcador (p. ej. cancelados)", () => {
    const rows = [
      m({ homeTeamId: "A", kickoffAt: 500, status: "finished", homeScore: null, awayScore: null }),
    ];
    expect(lastResultMatchFor(rows, "A")).toBeUndefined();
  });

  it("no toma partidos programados", () => {
    const rows = [m({ homeTeamId: "A", kickoffAt: 100, status: "scheduled" })];
    expect(lastResultMatchFor(rows, "A")).toBeUndefined();
  });
});
