// convex/sync.test.ts
// Tests unitarios puros de runSyncCycle (sin convex-test): el ciclo del cron
// con deps inyectadas (syncOne/pause), patrón de FetchDeps en lib/footballData.
import { describe, expect, it, vi } from "vitest";
import { runSyncCycle, SPACING_MS } from "./sync";

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
