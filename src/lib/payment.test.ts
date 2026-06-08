import { describe, it, expect } from "vitest";
import { paymentTriggerLabel } from "./payment";

describe("paymentTriggerLabel", () => {
  it("etiqueta correcta por estado", () => {
    expect(paymentTriggerLabel(false, null)).toBe("Pendiente");
    expect(paymentTriggerLabel(true, "efectivo")).toBe("✓ Efectivo");
    expect(paymentTriggerLabel(true, "transferencia")).toBe("✓ Transferencia");
    expect(paymentTriggerLabel(true, null)).toBe("✓ Pagó"); // legacy
  });
});
