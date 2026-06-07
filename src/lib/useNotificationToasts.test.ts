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
});
