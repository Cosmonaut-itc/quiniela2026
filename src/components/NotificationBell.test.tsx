// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Base UI mide con ResizeObserver/matchMedia, ausentes en jsdom: los polirellenamos.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
if (!window.matchMedia) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  }));
}

// Aislamos el componente de la red: Convex, sonner y la api generada se mockean.
const useQuery = vi.fn();
const markRead = vi.fn(() => Promise.resolve());
vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQuery(...args),
  useMutation: () => markRead,
}));
vi.mock("sonner", () => {
  const fn = vi.fn();
  return { toast: Object.assign(fn, { error: vi.fn() }) };
});
vi.mock("@/../convex/_generated/api", () => ({
  api: { notifications: { listForParticipant: "q1", listForAdmin: "q2", markRead: "m" } },
}));

import { NotificationBell } from "./NotificationBell";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("NotificationBell", () => {
  it("despliega el panel en un portal, fuera del contenedor con overflow-hidden que lo recortaría", async () => {
    useQuery.mockReturnValue({ unreadCount: 0, items: [] });
    render(
      <div data-testid="clip" className="overflow-hidden">
        <NotificationBell quinielaId="Q" token="tok" kind="me" />
      </div>,
    );

    fireEvent.click(screen.getByLabelText(/^Avisos/));
    const panel = await screen.findByText("Sin avisos todavía.");

    // El panel no debe colgar del contenedor que lo recorta: vive en un portal (document.body).
    expect(screen.getByTestId("clip")).not.toContainElement(panel);
  });

  it("marca como leídos al abrir cuando hay avisos sin leer", async () => {
    useQuery.mockReturnValue({
      unreadCount: 2,
      items: [{ id: "1", type: "x", title: "T", body: "b", createdAt: 1, read: false }],
    });
    render(<NotificationBell quinielaId="Q" token="tok" kind="admin" />);

    fireEvent.click(screen.getByLabelText(/^Avisos/));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith({ adminToken: "tok" }));
  });
});
