import { describe, it, expect } from "vitest";
import { paymentTriggerLabel } from "./payment";

describe("paymentTriggerLabel", () => {
  it("no pagado → 'Pendiente'", () => {
    expect(paymentTriggerLabel(false, null)).toBe("Pendiente");
    expect(paymentTriggerLabel(false, "efectivo")).toBe("Pendiente");
  });
  it("pagado con método → '✓ <Método>'", () => {
    expect(paymentTriggerLabel(true, "efectivo")).toBe("✓ Efectivo");
    expect(paymentTriggerLabel(true, "transferencia")).toBe("✓ Transferencia");
  });
  it("pagado sin método (legacy) → '✓ Pagó'", () => {
    expect(paymentTriggerLabel(true, null)).toBe("✓ Pagó");
  });
});
