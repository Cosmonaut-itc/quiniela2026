// convex/lib/syncWindow.test.ts
// Núcleo puro del idle-gate: ¿debe correr el ciclo de sync? Solo si algún partido de
// un torneo activo está en vivo o por comenzar. Saltar los ciclos ociosos evita el
// grueso del Database I/O (fetch + upserts + recompute + detect) cuando no pasa nada.
import { describe, it, expect } from "vitest";
import { anyMatchDueForSync, MATCH_SOON_MS, SYNC_PAST_MS } from "./syncWindow";

const NOW = 1_700_000_000_000;
const MIN = 60_000;

const m = (over: Partial<{ status: string; kickoffAt: number; tournamentCode?: string }>) => ({
  status: "scheduled",
  kickoffAt: NOW,
  tournamentCode: "WC",
  ...over,
});

describe("anyMatchDueForSync", () => {
  it("false sin partidos", () => {
    expect(anyMatchDueForSync([], ["WC"], NOW)).toBe(false);
  });

  it("true: partido en vivo de un torneo activo", () => {
    expect(anyMatchDueForSync([m({ status: "live" })], ["WC"], NOW)).toBe(true);
  });

  it("true: agendado que arranca dentro de la ventana (≤ MATCH_SOON_MS)", () => {
    expect(anyMatchDueForSync([m({ status: "scheduled", kickoffAt: NOW + 30 * MIN })], ["WC"], NOW)).toBe(true);
  });

  it("false: agendado que arranca MÁS allá de la ventana (> MATCH_SOON_MS)", () => {
    expect(anyMatchDueForSync([m({ status: "scheduled", kickoffAt: NOW + 2 * 60 * MIN })], ["WC"], NOW)).toBe(false);
  });

  it("false: partido finalizado (nunca vuelve a cambiar)", () => {
    expect(anyMatchDueForSync([m({ status: "finished", kickoffAt: NOW })], ["WC"], NOW)).toBe(false);
  });

  it("false: partido de un torneo NO activo", () => {
    expect(anyMatchDueForSync([m({ status: "live", tournamentCode: "PL" })], ["WC"], NOW)).toBe(false);
  });

  it("false: 'live' fantasma con kickoff demasiado viejo (> SYNC_PAST_MS) — dejamos de forzar sync", () => {
    expect(anyMatchDueForSync([m({ status: "live", kickoffAt: NOW - SYNC_PAST_MS - MIN })], ["WC"], NOW)).toBe(false);
  });

  it("true: agendado cuyo saque ya pasó pero sigue dentro de la ventana pasada (hay que sincronizar el salto a live)", () => {
    expect(anyMatchDueForSync([m({ status: "scheduled", kickoffAt: NOW - 30 * MIN })], ["WC"], NOW)).toBe(true);
  });

  it("true: partido legacy WC (clave tournamentCode AUSENTE) cuenta como 'WC'", () => {
    // Omitir la clave del todo modela la fila legacy real (no { tournamentCode: undefined }).
    const legacy = { status: "live", kickoffAt: NOW };
    expect(anyMatchDueForSync([legacy], ["WC"], NOW)).toBe(true);
  });

  it("límite: agendado a exactamente now + MATCH_SOON_MS sigue siendo due", () => {
    expect(anyMatchDueForSync([m({ status: "scheduled", kickoffAt: NOW + MATCH_SOON_MS })], ["WC"], NOW)).toBe(true);
  });

  it("límite: 'live' a exactamente now - SYNC_PAST_MS sigue siendo due", () => {
    expect(anyMatchDueForSync([m({ status: "live", kickoffAt: NOW - SYNC_PAST_MS })], ["WC"], NOW)).toBe(true);
  });

  it("true si ALGUNO de varios partidos es due (aunque otros no)", () => {
    expect(
      anyMatchDueForSync(
        [m({ status: "finished" }), m({ status: "scheduled", kickoffAt: NOW + 5 * 60 * MIN }), m({ status: "live" })],
        ["WC"],
        NOW,
      ),
    ).toBe(true);
  });
});
