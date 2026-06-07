// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: vi.fn() }));
import { toast } from "sonner";
import { useNotificationToasts } from "./useNotificationToasts";

type Item = { id: string; type: string; title: string; body: string; createdAt: number; read: boolean };
const item = (id: string, createdAt: number): Item => ({ id, type: "x", title: `T${id}`, body: "b", createdAt, read: false });

describe("useNotificationToasts", () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it("no anuncia lo viejo en la primera carga; sí anuncia lo nuevo después", () => {
    const { rerender } = renderHook(
      ({ items }) => useNotificationToasts("Q", "me", items),
      { initialProps: { items: [item("1", 100)] as Item[] } });
    expect(toast).not.toHaveBeenCalled();
    rerender({ items: [item("2", 200), item("1", 100)] });
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("no hace nada sin items", () => {
    renderHook(() => useNotificationToasts("Q", "me", undefined));
    expect(toast).not.toHaveBeenCalled();
  });

  it("la transición de carga (undefined → datos) no repite el historial", () => {
    const { rerender } = renderHook(
      ({ items }: { items: Item[] | undefined }) => useNotificationToasts("Q", "me", items),
      { initialProps: { items: undefined as Item[] | undefined } });
    expect(toast).not.toHaveBeenCalled();
    rerender({ items: [item("1", 100)] });
    expect(toast).not.toHaveBeenCalled(); // primera vez con datos: solo fija el corte, sin toasts
  });

  it("no falla si localStorage lanza (p. ej. modo privado)", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() { throw new Error("Storage unavailable"); },
    });
    try {
      expect(() => {
        const { rerender } = renderHook(
          ({ items }: { items: Item[] }) => useNotificationToasts("Q", "me", items),
          { initialProps: { items: [item("1", 100)] as Item[] } });
        rerender({ items: [item("2", 200), item("1", 100)] });
      }).not.toThrow();
      // Sin watermark persistente cada render cuenta como "primera vez" → degrada a sin toasts.
      expect(toast).not.toHaveBeenCalled();
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
    }
  });
});
