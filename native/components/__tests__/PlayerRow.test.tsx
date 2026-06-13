/**
 * PlayerRow (SEN-25, Tarea C — criterio "fila de jugador"). Espejo de
 * src/components/PlayerRow.tsx. Reproduce los tres casos estructurales del web:
 *   - sin equipos (teams.length === 0) → carta estática, SIN chevron, no expande;
 *   - con equipos → fila pulsable con chevron que al tocarse expande y revela los
 *     equipos del jugador (bandera + nombre + pastilla vivo/fuera);
 *   - estados: out (nombre tachado), champion (anillo dorado), pending (oculta el
 *     conteo de vivos).
 * Se asierta COMPORTAMIENTO (qué se renderiza por estado), no estilos computados,
 * salvo el line-through del nombre y el anillo, que se exponen por testID.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { OverviewData } from "@convex/types";

import { PlayerRow } from "@/components/PlayerRow";

type Player = OverviewData["players"][number];
type PlayerTeam = Player["teams"][number];

const playerTeam = (over: Partial<PlayerTeam> = {}): PlayerTeam => ({
  team: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" },
  alive: true,
  ...over,
});

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

describe("PlayerRow", () => {
  it("jugador SIN equipos → carta estática, sin chevron, tocar no expande", () => {
    render(<PlayerRow p={player({ teams: [] })} />);

    expect(screen.getByText("Ana")).toBeOnTheScreen();
    // No hay chevron (testID solo cuando es expandible).
    expect(screen.queryByTestId("player-chevron")).toBeNull();
    // La fila no es pulsable: no existe el trigger.
    expect(screen.queryByTestId("player-row-trigger")).toBeNull();
  });

  it("jugador CON equipos → chevron presente; tocar expande y revela los equipos", () => {
    render(
      <PlayerRow
        p={player({
          teams: [
            playerTeam({ team: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" } }),
            playerTeam({
              team: { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "B" },
              alive: false,
            }),
          ],
        })}
      />,
    );

    // Chevron visible en una fila expandible.
    expect(screen.getByTestId("player-chevron")).toBeOnTheScreen();

    // El nombre de un equipo SOLO vive en el panel expandido: ausente al inicio.
    expect(screen.queryByText("México")).toBeNull();
    expect(screen.queryByText("Brasil")).toBeNull();

    // Antes de expandir solo existe la pastilla "Vivo" del resumen del jugador
    // (status alive); ninguna del panel de equipos aún.
    const vivoBefore = screen.getAllByText(/Vivo/).length;
    expect(screen.queryByText("Fuera")).toBeNull();

    fireEvent.press(screen.getByTestId("player-row-trigger"));

    // Tras expandir, los equipos del panel son visibles.
    expect(screen.getByText("México")).toBeOnTheScreen();
    expect(screen.getByText("Brasil")).toBeOnTheScreen();

    // El equipo vivo (México) suma una pastilla "Vivo" extra; el eliminado
    // (Brasil) muestra "Fuera" — ambas vía el StatusBadge reutilizado en
    // PlayerTeamRow.
    expect(screen.getAllByText(/Vivo/).length).toBe(vivoBefore + 1);
    expect(screen.getByText("Fuera")).toBeOnTheScreen();

    // El nombre del equipo eliminado va tachado (line-through); el vivo, no.
    expect(screen.getByText("Brasil").props.className ?? "").toContain("line-through");
    expect(screen.getByText("México").props.className ?? "").not.toContain("line-through");
  });

  it("status out → nombre con line-through", () => {
    render(<PlayerRow p={player({ status: "out" })} />);
    const name = screen.getByTestId("player-name");
    expect(name.props.className ?? "").toContain("line-through");
  });

  it("status champion → anillo dorado alrededor del avatar", () => {
    render(<PlayerRow p={player({ status: "champion" })} />);
    expect(screen.getByTestId("champion-ring")).toBeOnTheScreen();
  });

  it("status alive (no campeón) → sin anillo dorado", () => {
    render(<PlayerRow p={player({ status: "alive" })} />);
    expect(screen.queryByTestId("champion-ring")).toBeNull();
  });

  it("status pending → oculta el conteo de vivos (/N vivos)", () => {
    render(<PlayerRow p={player({ status: "pending" })} />);
    expect(screen.queryByText(/vivos/)).toBeNull();
  });

  it("status alive → muestra el conteo de vivos (/N vivos)", () => {
    render(<PlayerRow p={player({ status: "alive", aliveCount: 2, totalCount: 3 })} />);
    expect(screen.getByText(/\/3 vivos/)).toBeOnTheScreen();
  });
});
