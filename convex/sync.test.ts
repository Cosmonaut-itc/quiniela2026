// convex/sync.test.ts
// Tests unitarios puros de runSyncCycle (sin convex-test): el ciclo del cron
// con deps inyectadas (syncOne/pause), patrón de FetchDeps en lib/footballData.
import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { runSyncCycle, SPACING_MS } from "./sync";
import schema from "./schema";
import { internal } from "./_generated/api";
import { MATCH_SOON_MS } from "./lib/syncWindow";

const modules = import.meta.glob("./**/*.*s");
const GNOW = 1_700_000_000_000;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const mkMatch = (over: Record<string, unknown>) => ({
  stage: "group" as const,
  kickoffAt: GNOW,
  status: "scheduled",
  externalId: "m",
  tournamentCode: "WC",
  ...over,
});

describe("runSyncCycle", () => {
  it("sincroniza en orden, con pausa de SPACING_MS solo ENTRE torneos", async () => {
    const eventos: string[] = [];
    const syncOne = async (code: string) => {
      eventos.push(`sync:${code}`);
      return { ok: true };
    };
    const pause = async (ms: number) => {
      eventos.push(`pause:${ms}`);
    };

    const synced = await runSyncCycle(["WC", "PL", "SA"], syncOne, pause);

    // Secuencial y espaciado: nada antes del primero, una pausa entre cada par.
    expect(eventos).toEqual([
      "sync:WC",
      `pause:${SPACING_MS}`,
      "sync:PL",
      `pause:${SPACING_MS}`,
      "sync:SA",
    ]);
    expect(synced).toEqual(["WC", "PL", "SA"]);
  });

  it("sin torneos activos no sincroniza ni pausa", async () => {
    const syncOne = vi.fn(async () => ({ ok: true }));
    const pause = vi.fn(async () => {});

    const synced = await runSyncCycle([], syncOne, pause);

    expect(synced).toEqual([]);
    expect(syncOne).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });

  it("un syncOne que LANZA no aborta el resto", async () => {
    // syncTournament atrapa sus errores de aplicación, pero ctx.runAction puede
    // rechazar por errores de sistema de Convex (fallos transitorios, timeout
    // de la action hija); el ciclo debe tratarlo como un fallo más.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const syncOne = vi.fn(async (code: string) => {
        if (code === "PL") throw new Error("transient Convex failure");
        return { ok: true };
      });
      const pause = vi.fn(async () => {});

      const synced = await runSyncCycle(["WC", "PL", "SA"], syncOne, pause);

      expect(synced).toEqual(["WC", "SA"]);
      expect(syncOne).toHaveBeenCalledTimes(3);
      // El rate-limiting se mantiene aunque un torneo falle: 2 pausas entre 3 llamadas.
      expect(pause).toHaveBeenCalledTimes(2);
      expect(pause).toHaveBeenNthCalledWith(1, SPACING_MS);
      expect(pause).toHaveBeenNthCalledWith(2, SPACING_MS);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const mensaje = String(errorSpy.mock.calls[0]?.join(" "));
      expect(mensaje).toContain("PL");
      expect(mensaje).toContain("transient Convex failure");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("un fallo intermedio no aborta el resto y queda fuera de synced", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const syncOne = vi.fn(async (code: string) =>
        code === "PL" ? { ok: false, error: "boom" } : { ok: true },
      );
      const pause = vi.fn(async () => {});

      const synced = await runSyncCycle(["WC", "PL", "SA"], syncOne, pause);

      expect(synced).toEqual(["WC", "SA"]);
      expect(syncOne).toHaveBeenCalledTimes(3);
      // El rate-limiting se mantiene aunque un torneo falle: 2 pausas entre 3 llamadas.
      expect(pause).toHaveBeenCalledTimes(2);
      expect(pause).toHaveBeenNthCalledWith(1, SPACING_MS);
      expect(pause).toHaveBeenNthCalledWith(2, SPACING_MS);
      // El fallo queda en los logs de Convex con código y error.
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const mensaje = String(errorSpy.mock.calls[0]?.join(" "));
      expect(mensaje).toContain("PL");
      expect(mensaje).toContain("boom");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

// Idle-gate (#4): la query lee SOLO los partidos cerca de "now" (índice by_kickoff)
// y decide si el ciclo de sync debe correr. Cuando devuelve false, syncMatches se
// salta el fetch + upserts + recompute + detect de TODO el catálogo.
describe("anyDueForSync (idle-gate query)", () => {
  it("false cuando el único partido está lejísimos en el futuro (fuera de la ventana)", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("matches", mkMatch({ kickoffAt: GNOW + 10 * 24 * 60 * MIN, externalId: "far" })));
    expect(await t.query(internal.sync.anyDueForSync, { codes: ["WC"], now: GNOW })).toBe(false);
  });

  it("true cuando hay un partido en vivo de un torneo activo", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("matches", mkMatch({ status: "live", externalId: "live" })));
    expect(await t.query(internal.sync.anyDueForSync, { codes: ["WC"], now: GNOW })).toBe(true);
  });

  it("false cuando el único en vivo es de un torneo NO activo (con el activo ya sembrado)", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      // WC ya sembrado (un finalizado viejo) → no dispara la red de sembrado;
      await ctx.db.insert("matches", mkMatch({ status: "finished", kickoffAt: GNOW - 30 * DAY, externalId: "wc-old" }));
      // el único en vivo es de PL, que NO está en codes.
      await ctx.db.insert("matches", mkMatch({ status: "live", tournamentCode: "PL", externalId: "pl" }));
    });
    expect(await t.query(internal.sync.anyDueForSync, { codes: ["WC"], now: GNOW })).toBe(false);
  });

  it("true para un agendado dentro de la ventana pre-saque", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("matches", mkMatch({ status: "scheduled", kickoffAt: GNOW + 30 * MIN, externalId: "soon" })));
    expect(await t.query(internal.sync.anyDueForSync, { codes: ["WC"], now: GNOW })).toBe(true);
  });

  it("false para un agendado justo PASADA la ventana (el índice ni lo lee)", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("matches", mkMatch({ status: "scheduled", kickoffAt: GNOW + MATCH_SOON_MS + MIN, externalId: "soon+1" })));
    expect(await t.query(internal.sync.anyDueForSync, { codes: ["WC"], now: GNOW })).toBe(false);
  });

  it("false con codes vacío aunque haya un partido en vivo", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("matches", mkMatch({ status: "live", externalId: "live" })));
    expect(await t.query(internal.sync.anyDueForSync, { codes: [], now: GNOW })).toBe(false);
  });
});

// Red de seguridad de sembrado: aunque prepare siembra los partidos al crear la
// quiniela, si el torneo tenía equipos pero aún no fixtures, el cron debe poder
// descubrirlos. La clave: distinguir "vacío" (sembrar) de "ya sembrado aunque todo
// finalizado" (NO reabrir el always-on de quinielas viejas/torneos terminados).
describe("anyDueForSync — red de seguridad de sembrado", () => {
  it("true: torneo activo SIN ningún partido sembrado (hay que descubrir/sembrar)", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(internal.sync.anyDueForSync, { codes: ["WC"], now: GNOW })).toBe(true);
  });

  it("false: torneo con partidos pero TODOS finalizados hace semanas (NO reabre always-on)", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("matches", mkMatch({ status: "finished", kickoffAt: GNOW - 30 * DAY, externalId: "old" })));
    expect(await t.query(internal.sync.anyDueForSync, { codes: ["WC"], now: GNOW })).toBe(false);
  });

  it("false: WC con SOLO partidos legacy (tournamentCode ausente) ya sembrados — no es 'vacío'", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("matches", { stage: "group", kickoffAt: GNOW - 30 * DAY, status: "finished", externalId: "legacy" }));
    expect(await t.query(internal.sync.anyDueForSync, { codes: ["WC"], now: GNOW })).toBe(false);
  });

  it("true: uno de varios torneos activos está vacío (debe sembrarse aunque otro ya tenga datos)", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("matches", mkMatch({ status: "finished", kickoffAt: GNOW - 30 * DAY, externalId: "wc-old" })));
    expect(await t.query(internal.sync.anyDueForSync, { codes: ["WC", "PL"], now: GNOW })).toBe(true);
  });
});
