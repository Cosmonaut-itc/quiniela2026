// convex/matches.skipwrite.test.ts
// @vitest-environment edge-runtime
// Núcleo puro de "no reescribir un partido que no cambió": el cron sincroniza TODOS
// los partidos del torneo cada 5 min; sin este guard, cada upsert hacía un patch
// incondicional → ancho de banda de DB (Database I/O) desbordado. Aquí solo probamos
// la decisión pura; el uso en upsertMatchResult vive en matches.ts.
import { describe, it, expect } from "vitest";
import { matchFieldsChanged } from "./matches";

describe("matchFieldsChanged (skip-unchanged-write)", () => {
  const base = {
    stage: "group", group: "A", matchday: 1, tournamentCode: "WC",
    homeTeamId: "t1", awayTeamId: "t2", kickoffAt: 1000,
    homeScore: 2, awayScore: 0, status: "finished",
    winnerTeamId: "t1", externalId: "m1", bracketSlot: undefined,
  } as const;

  it("es false cuando cada campo persistible es idéntico", () => {
    expect(matchFieldsChanged({ ...base }, { ...base })).toBe(false);
  });

  it("es true cuando cambia el marcador", () => {
    expect(matchFieldsChanged({ ...base }, { ...base, awayScore: 1 })).toBe(true);
  });

  it("es true cuando cambia el status (scheduled → live)", () => {
    expect(matchFieldsChanged({ ...base, status: "scheduled" }, { ...base, status: "live" })).toBe(true);
  });

  it("trata undefined-vs-undefined como sin cambio (group/bracketSlot ausentes)", () => {
    expect(
      matchFieldsChanged(
        { ...base, group: undefined, bracketSlot: undefined },
        { ...base, group: undefined, bracketSlot: undefined },
      ),
    ).toBe(false);
  });

  it("ignora campos extra del doc almacenado (_id, _creationTime)", () => {
    expect(matchFieldsChanged({ ...base, _id: "x", _creationTime: 5 }, { ...base })).toBe(false);
  });
});
