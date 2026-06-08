// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PlayerRow } from "./PlayerRow";

const team = (name: string, group: string, alive: boolean) => ({
  team: { code: name.slice(0, 3).toUpperCase(), name, flag: "🏴", group },
  alive,
});

describe("PlayerRow", () => {
  it("shows alive count and name", () => {
    render(
      <PlayerRow
        p={{ participantId: "1", name: "Ana", photoUrl: null, aliveCount: 3, totalCount: 5, status: "alive", teams: [] }}
      />,
    );
    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("oculta los equipos hasta que se toca la carta y los muestra al expandir", async () => {
    render(
      <PlayerRow
        p={{
          participantId: "1", name: "Ana", photoUrl: null, aliveCount: 1, totalCount: 2, status: "alive",
          teams: [team("Brasil", "C", true), team("Japón", "E", false)],
        }}
      />,
    );
    // colapsada: el panel no está montado
    expect(screen.queryByText("Brasil")).toBeNull();
    // expandir
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Brasil")).toBeDefined();
    expect(screen.getByText("Japón")).toBeDefined();
    // colapsar de nuevo
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.queryByText("Brasil")).toBeNull());
  });

  it("no es expandible cuando el jugador no tiene equipos", () => {
    render(
      <PlayerRow
        p={{ participantId: "1", name: "Ana", photoUrl: null, aliveCount: 0, totalCount: 0, status: "pending", teams: [] }}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
