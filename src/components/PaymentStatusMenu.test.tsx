// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentStatusMenu, paymentTriggerLabel } from "./PaymentStatusMenu";

describe("paymentTriggerLabel", () => {
  it("etiqueta correcta por estado", () => {
    expect(paymentTriggerLabel(false, null)).toBe("Pendiente");
    expect(paymentTriggerLabel(true, "efectivo")).toBe("✓ Efectivo");
    expect(paymentTriggerLabel(true, "transferencia")).toBe("✓ Transferencia");
    expect(paymentTriggerLabel(true, null)).toBe("✓ Pagó"); // legacy
  });
});

describe("PaymentStatusMenu", () => {
  it("el botón refleja el estado actual", () => {
    render(<PaymentStatusMenu paid={true} method="efectivo" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Estado de pago" }).textContent).toBe("✓ Efectivo");
  });

  it("abrir el menú y elegir un método dispara onSelect", async () => {
    const onSelect = vi.fn();
    render(<PaymentStatusMenu paid={false} method={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Estado de pago" }));
    fireEvent.click(await screen.findByText("Transferencia"));
    expect(onSelect).toHaveBeenCalledWith("transferencia");
  });
});
