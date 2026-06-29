// convex/lib/syncGate.test.ts
import { describe, it, expect } from "vitest";
import { syncCronEnabled } from "./syncGate";

describe("syncCronEnabled", () => {
  it("habilitado por defecto cuando no hay variable (prod no necesita config nueva)", () => {
    expect(syncCronEnabled({})).toBe(true);
  });

  it("deshabilitado cuando DISABLE_SYNC=1 (apagar el cron de dev sin redeploy)", () => {
    expect(syncCronEnabled({ DISABLE_SYNC: "1" })).toBe(false);
  });

  it("deshabilitado cuando DISABLE_SYNC=true", () => {
    expect(syncCronEnabled({ DISABLE_SYNC: "true" })).toBe(false);
  });

  it("habilitado cuando DISABLE_SYNC trae un valor falsy ('0' o vacío)", () => {
    expect(syncCronEnabled({ DISABLE_SYNC: "0" })).toBe(true);
    expect(syncCronEnabled({ DISABLE_SYNC: "" })).toBe(true);
  });

  it("normaliza el flag: mayúsculas y espacios igual apagan (kill-switch robusto)", () => {
    expect(syncCronEnabled({ DISABLE_SYNC: "TRUE" })).toBe(false);
    expect(syncCronEnabled({ DISABLE_SYNC: " true " })).toBe(false);
    expect(syncCronEnabled({ DISABLE_SYNC: " 1 " })).toBe(false);
  });
});
