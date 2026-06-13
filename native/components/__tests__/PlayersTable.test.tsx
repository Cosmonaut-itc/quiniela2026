/**
 * PlayersTable (SEN-25, Tarea C). Espejo de src/components/PlayersTable.tsx:
 * sección colapsable "Tabla de jugadores", arranca expandida; tocar el encabezado
 * colapsa/expande el cuerpo. Vacío → EmptyTile "Aún no se inscribe nadie";
 * freeSlots > 0 → tile de lugares libres; con jugadores → sus nombres.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { OverviewData } from "@convex/types";

import { PlayersTable } from "@/components/PlayersTable";

type Player = OverviewData["players"][number];

const player = (over: Partial<Player> = {}): Player => ({
  participantId: "p1",
  name: "Ana",
  photoUrl: null,
  aliveCount: 2,
  totalCount: 3,
  status: "alive",
  teams: [],
  ...over,
});

describe("PlayersTable", () => {
  it("sin jugadores → EmptyTile 'Aún no se inscribe nadie'", () => {
    render(<PlayersTable players={[]} freeSlots={0} />);
    expect(screen.getByText(/Aún no se inscribe nadie/)).toBeOnTheScreen();
  });

  it("freeSlots > 0 → tile de lugares libres (pluralización exacta)", () => {
    render(<PlayersTable players={[]} freeSlots={1} />);
    expect(screen.getByText(/1 lugar libre/)).toBeOnTheScreen();
  });

  it("freeSlots plural → 'lugares libres'", () => {
    render(<PlayersTable players={[]} freeSlots={3} />);
    expect(screen.getByText(/3 lugares libres/)).toBeOnTheScreen();
  });

  it("con jugadores → renderiza sus nombres", () => {
    render(
      <PlayersTable
        players={[
          player({ participantId: "p1", name: "Ana" }),
          player({ participantId: "p2", name: "Beto" }),
        ]}
        freeSlots={0}
      />,
    );
    expect(screen.getByText("Ana")).toBeOnTheScreen();
    expect(screen.getByText("Beto")).toBeOnTheScreen();
  });

  it("encabezado muestra el conteo de jugadores", () => {
    render(
      <PlayersTable players={[player({ name: "Ana" })]} freeSlots={0} />,
    );
    expect(screen.getByText(/Tabla de jugadores · 1/)).toBeOnTheScreen();
  });

  it("tocar el encabezado colapsa y vuelve a expandir el cuerpo", () => {
    render(
      <PlayersTable players={[player({ name: "Ana" })]} freeSlots={0} />,
    );
    // Arranca expandida: el jugador es visible.
    expect(screen.getByText("Ana")).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId("players-table-header"));
    // Colapsada: el cuerpo se desmonta.
    expect(screen.queryByText("Ana")).toBeNull();

    fireEvent.press(screen.getByTestId("players-table-header"));
    // Re-expandida.
    expect(screen.getByText("Ana")).toBeOnTheScreen();
  });
});
