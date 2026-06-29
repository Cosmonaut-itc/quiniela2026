/**
 * BracketView (SEN-25, Tarea D). Espejo de src/components/BracketView.tsx.
 * Bracket eliminatorio en columnas con scroll horizontal: estado vacío,
 * lado sin definir ("Por definir"), partido terminado con marcadores, ronda
 * final con tratamiento dorado, y toggle de dueños. Se asierta texto/conteo,
 * nunca estilos computados.
 */
import { render, screen } from "@testing-library/react-native";
import type { MundialData } from "@convex/types";

import { BracketView } from "@/components/BracketView";

type Bracket = MundialData["bracket"];

const MEX = { code: "MEX", name: "México", flag: "🇲🇽", group: "A" };
const BRA = { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "B" };
const KICKOFF = Date.UTC(2026, 5, 13, 18, 30);

describe("BracketView", () => {
  it("bracket vacío → muestra la copia de estado vacío", () => {
    render(<BracketView bracket={[]} />);
    expect(screen.getByText(/El bracket se llenará cuando terminen los grupos/)).toBeOnTheScreen();
  });

  it("lado home null → renderiza 'Por definir'", () => {
    const bracket: Bracket = [
      {
        stage: "semis",
        label: "Semifinales",
        matches: [
          {
            home: null,
            away: { team: BRA, owner: "Beto" },
            homeScore: null,
            awayScore: null,
            winnerTeamId: null,
            status: "scheduled",
            kickoffAt: KICKOFF,
          },
        ],
      },
    ];
    render(<BracketView bracket={bracket} />);
    expect(screen.getByText("Por definir")).toBeOnTheScreen();
    // El lado away sí tiene equipo (su código se ve).
    expect(screen.getByText("BRA")).toBeOnTheScreen();
  });

  it("partido finished con marcadores → renderiza ambos valores y ambos códigos de equipo", () => {
    const bracket: Bracket = [
      {
        stage: "semis",
        label: "Semifinales",
        matches: [
          {
            home: { team: MEX, owner: "Ana" },
            away: { team: BRA, owner: "Beto" },
            homeScore: 2,
            awayScore: 1,
            winnerTeamId: "MEX",
            status: "finished",
            kickoffAt: KICKOFF,
          },
        ],
      },
    ];
    render(<BracketView bracket={bracket} />);
    expect(screen.getByText("2")).toBeOnTheScreen();
    expect(screen.getByText("1")).toBeOnTheScreen();
    // Ambos lados deben renderizarse aunque sólo uno gane (cubre homeWin/awayWin).
    expect(screen.getByText("MEX")).toBeOnTheScreen();
    expect(screen.getByText("BRA")).toBeOnTheScreen();
  });

  it("partido finished empate (1-1) → renderiza sin error y ambos códigos de equipo", () => {
    const bracket: Bracket = [
      {
        stage: "semis",
        label: "Semifinales",
        matches: [
          {
            home: { team: MEX, owner: "Ana" },
            away: { team: BRA, owner: "Beto" },
            homeScore: 1,
            awayScore: 1,
            winnerTeamId: null,
            status: "finished",
            kickoffAt: KICKOFF,
          },
        ],
      },
    ];
    render(<BracketView bracket={bracket} />);
    // Con empate homeWin y awayWin son ambos false; ambos lados deben aparecer.
    expect(screen.getByText("MEX")).toBeOnTheScreen();
    expect(screen.getByText("BRA")).toBeOnTheScreen();
  });

  it("ronda final → muestra el label dorado con 🏆", () => {
    const bracket: Bracket = [
      {
        stage: "final",
        label: "Final",
        matches: [
          {
            home: { team: MEX, owner: "Ana" },
            away: { team: BRA, owner: "Beto" },
            homeScore: null,
            awayScore: null,
            winnerTeamId: null,
            status: "scheduled",
            kickoffAt: KICKOFF,
          },
        ],
      },
    ];
    render(<BracketView bracket={bracket} />);
    expect(screen.getByText(/🏆/)).toBeOnTheScreen();
    expect(screen.getByText(/Final/)).toBeOnTheScreen();
  });

  it("showOwners por defecto (true) → renderiza el nombre del dueño junto al equipo", () => {
    const bracket: Bracket = [
      {
        stage: "semis",
        label: "Semifinales",
        matches: [
          {
            home: { team: MEX, owner: "Ana" },
            away: { team: BRA, owner: "Beto" },
            homeScore: null,
            awayScore: null,
            winnerTeamId: null,
            status: "scheduled",
            kickoffAt: KICKOFF,
          },
        ],
      },
    ];
    render(<BracketView bracket={bracket} />);
    expect(screen.getByText(/Ana/)).toBeOnTheScreen();
    expect(screen.getByText(/Beto/)).toBeOnTheScreen();
  });

  it("showOwners={false} → NO renderiza nombres de dueños", () => {
    const bracket: Bracket = [
      {
        stage: "semis",
        label: "Semifinales",
        matches: [
          {
            home: { team: MEX, owner: "Ana" },
            away: { team: BRA, owner: "Beto" },
            homeScore: null,
            awayScore: null,
            winnerTeamId: null,
            status: "scheduled",
            kickoffAt: KICKOFF,
          },
        ],
      },
    ];
    render(<BracketView bracket={bracket} showOwners={false} />);
    expect(screen.queryByText(/Ana/)).toBeNull();
    expect(screen.queryByText(/Beto/)).toBeNull();
    // Los equipos siguen ahí.
    expect(screen.getByText("MEX")).toBeOnTheScreen();
  });
});
