/**
 * Leaderboard (SEN-26). Espejo de src/components/Leaderboard.tsx.
 * - Vacío (rows=[]) → leyenda "Aún no hay jugadores."; no hay filas pulsables.
 * - Render de filas → nombres, puntos, línea "C/P aciertos" y rank visibles.
 * - Press en una fila → onSelect con el participantId correcto.
 * - Sin onSelect → pulsar una fila no revienta.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ProgolLeaderRow } from "@convex/types";

import { Leaderboard } from "@/components/Leaderboard";

const row = (over: Partial<ProgolLeaderRow> = {}): ProgolLeaderRow => ({
  participantId: "p1",
  name: "Ana",
  photoUrl: null,
  points: 7,
  correct: 3,
  played: 5,
  rank: 1,
  ...over,
});

describe("Leaderboard", () => {
  it("vacío → leyenda y sin filas pulsables", () => {
    render(<Leaderboard rows={[]} />);
    expect(screen.getByText("Aún no hay jugadores.")).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Ver tarjeta de/)).toBeNull();
  });

  it("render de filas → nombres, puntos, aciertos y rank", () => {
    render(
      <Leaderboard
        rows={[
          row({ participantId: "p1", name: "Ana", points: 7, correct: 3, played: 5, rank: 1 }),
          row({ participantId: "p2", name: "Beto", points: 4, correct: 2, played: 5, rank: 2 }),
        ]}
      />,
    );
    expect(screen.getByText("Ana")).toBeOnTheScreen();
    expect(screen.getByText("Beto")).toBeOnTheScreen();
    // El nodo de puntos compone "{points}" + un <Text> hijo " pts" (espejo del
    // span web): su texto host es "7 pts", así que se asierta con regex.
    expect(screen.getByText(/^7\s*pts$/)).toBeOnTheScreen();
    expect(screen.getByText(/^4\s*pts$/)).toBeOnTheScreen();
    expect(screen.getByText("3/5 aciertos")).toBeOnTheScreen();
    expect(screen.getByText("2/5 aciertos")).toBeOnTheScreen();
    expect(screen.getByText("1")).toBeOnTheScreen();
    expect(screen.getByText("2")).toBeOnTheScreen();
    expect(screen.getAllByLabelText(/Ver tarjeta de/)).toHaveLength(2);
  });

  it("press en una fila → onSelect con el participantId correcto", () => {
    const onSelect = jest.fn();
    render(
      <Leaderboard
        rows={[
          row({ participantId: "p1", name: "Ana" }),
          row({ participantId: "p2", name: "Beto", rank: 2 }),
        ]}
        onSelect={onSelect}
      />,
    );
    fireEvent.press(screen.getByLabelText("Ver tarjeta de Ana"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("sin onSelect → pulsar una fila no revienta", () => {
    render(<Leaderboard rows={[row({ participantId: "p1", name: "Ana" })]} />);
    expect(() =>
      fireEvent.press(screen.getByLabelText("Ver tarjeta de Ana")),
    ).not.toThrow();
  });
});
