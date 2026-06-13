/**
 * GroupsView (SEN-25, Tarea D). Espejo de src/components/GroupsView.tsx.
 * Cada grupo es una mini-tabla; las dos primeras filas avanzan (punto verde),
 * los equipos eliminados se atenúan + tachan, y cada equipo arrastra el avatar
 * y nombre de su dueño. Se asierta COMPORTAMIENTO (texto/conteos), nunca estilos
 * computados (la className de uniwind es no-op bajo jest).
 */
import { render, screen } from "@testing-library/react-native";
import type { MundialData } from "@convex/types";

import { GroupsView } from "@/components/GroupsView";

type Groups = MundialData["groups"];
type Row = Groups[number]["rows"][number];

const row = (over: Partial<Row> = {}): Row => ({
  team: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" },
  points: 6,
  gd: 3,
  gf: 5,
  ownerName: "Ana",
  ownerPhotoUrl: null,
  alive: true,
  ...over,
});

const groups = (): Groups => [
  {
    group: "A",
    rows: [
      row({ team: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" }, ownerName: "Ana", points: 9, alive: true }),
      row({ team: { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "A" }, ownerName: "Beto", points: 6, alive: true }),
      row({ team: { code: "JPN", name: "Japón", flag: "🇯🇵", group: "A" }, ownerName: "Caro", points: 1, alive: false }),
    ],
  },
];

describe("GroupsView", () => {
  it("renderiza la etiqueta del grupo y los nombres de equipo (los que avanzan y el eliminado)", () => {
    render(<GroupsView groups={groups()} />);
    expect(screen.getByText(/Grupo A/)).toBeOnTheScreen();
    expect(screen.getByText("México")).toBeOnTheScreen();
    expect(screen.getByText("Brasil")).toBeOnTheScreen();
    // El equipo eliminado sigue renderizando su nombre (tachado, no asertable).
    expect(screen.getByText("Japón")).toBeOnTheScreen();
  });

  it("renderiza la leyenda clasifica / eliminado", () => {
    render(<GroupsView groups={groups()} />);
    expect(screen.getByText(/clasifica/)).toBeOnTheScreen();
    expect(screen.getByText(/eliminado/)).toBeOnTheScreen();
  });

  it("showOwners por defecto (true) → renderiza los nombres de los dueños", () => {
    render(<GroupsView groups={groups()} />);
    expect(screen.getByText("Ana")).toBeOnTheScreen();
    expect(screen.getByText("Beto")).toBeOnTheScreen();
    expect(screen.getByText("Caro")).toBeOnTheScreen();
  });

  it("showOwners={false} → NO renderiza los nombres de los dueños", () => {
    render(<GroupsView groups={groups()} showOwners={false} />);
    expect(screen.queryByText("Ana")).toBeNull();
    expect(screen.queryByText("Beto")).toBeNull();
    expect(screen.queryByText("Caro")).toBeNull();
    // Los equipos siguen ahí.
    expect(screen.getByText("México")).toBeOnTheScreen();
  });
});
