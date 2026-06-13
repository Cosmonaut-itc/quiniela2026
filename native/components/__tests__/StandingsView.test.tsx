/**
 * StandingsView (SEN-25, Tarea D). Espejo de src/components/StandingsView.tsx.
 * Tabla de posiciones de liga. La única lógica condicional es el prefijo "+"
 * cuando la diferencia de goles es positiva.
 */
import { render, screen } from "@testing-library/react-native";
import type { TeamLite } from "@convex/types";

import { StandingsView } from "@/components/StandingsView";

type Row = { team: TeamLite; points: number; played: number; gd: number; gf: number };

const standings: Row[] = [
  { team: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" }, points: 9, played: 3, gd: 4, gf: 7 },
  { team: { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "A" }, points: 3, played: 3, gd: -2, gf: 2 },
];

describe("StandingsView", () => {
  it("renderiza nombres de equipo y la cabecera de columnas", () => {
    render(<StandingsView standings={standings} />);
    expect(screen.getByText("México")).toBeOnTheScreen();
    expect(screen.getByText("Brasil")).toBeOnTheScreen();
    expect(screen.getByText("Equipo")).toBeOnTheScreen();
    expect(screen.getByText("Pts")).toBeOnTheScreen();
  });

  it("dif positiva → prefijo '+'; dif negativa → número plano", () => {
    render(<StandingsView standings={standings} />);
    expect(screen.getByText("+4")).toBeOnTheScreen();
    expect(screen.getByText("-2")).toBeOnTheScreen();
  });

  it("gd === 0 → renderiza '0' (sin prefijo '+')", () => {
    const withZeroGd: Row[] = [
      { team: { code: "ARG", name: "Argentina", flag: "🇦🇷", group: "B" }, points: 1, played: 1, gd: 0, gf: 1 },
    ];
    render(<StandingsView standings={withZeroGd} />);
    // El condicional `r.gd > 0 ? \`+${r.gd}\` : r.gd` debe producir "0", no "+0".
    expect(screen.getByText("0")).toBeOnTheScreen();
    expect(screen.queryByText("+0")).toBeNull();
  });
});
