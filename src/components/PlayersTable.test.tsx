// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PlayersTable } from "./PlayersTable";

const player = (name: string) => ({
  participantId: name, name, photoUrl: null,
  aliveCount: 1, totalCount: 1, status: "alive" as const, teams: [],
});

describe("PlayersTable", () => {
  it("muestra la lista expandida por defecto", () => {
    render(<PlayersTable players={[player("Ana"), player("Beto")]} freeSlots={0} />);
    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("Beto")).toBeDefined();
  });

  it("colapsa toda la sección al tocar el encabezado", async () => {
    render(<PlayersTable players={[player("Ana")]} freeSlots={0} />);
    fireEvent.click(screen.getByRole("button", { name: /tabla de jugadores/i }));
    await waitFor(() => expect(screen.queryByText("Ana")).toBeNull());
  });

  it("muestra el estado vacío cuando no hay jugadores", () => {
    render(<PlayersTable players={[]} freeSlots={2} />);
    expect(screen.getByText(/sé el primero/i)).toBeDefined();
  });
});
