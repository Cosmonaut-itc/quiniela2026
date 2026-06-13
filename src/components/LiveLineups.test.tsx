// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveLineups, LineupSheet } from "./LiveLineups";
import type { LiveMatchLineupView } from "@/../convex/types";

const team = (code: string, name: string) => ({ code, name, flag: `https://crests/${code}.png`, group: "A" });
const match = (over: Partial<LiveMatchLineupView> = {}): LiveMatchLineupView => ({
  matchId: "m1", home: team("ALP", "Alpha"), away: team("BET", "Beta"),
  homeScore: 1, awayScore: 0,
  lineup: { home: { formation: "4-3-3", coach: "Pep", startXI: [{ name: "Ederson", number: 31, pos: "G" }], bench: [{ name: "Ortega", number: 18, pos: "G" }] },
            away: { formation: "4-4-2", coach: "Arteta", startXI: [{ name: "Raya", number: 1, pos: "G" }], bench: [] } },
  ...over,
});

describe("LiveLineups", () => {
  it("no renderiza nada sin partidos en vivo", () => {
    const { container } = render(<LiveLineups matches={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("renderiza una tarjeta por partido en vivo", () => {
    render(<LiveLineups matches={[match()]} />);
    expect(screen.getByText("Alpha")).toBeDefined();
    expect(screen.getByText("Beta")).toBeDefined();
    expect(screen.getByText(/en vivo/i)).toBeDefined();
  });
});

describe("LineupSheet", () => {
  it("muestra formación, DT, 11 y banca de ambos equipos", () => {
    render(<LineupSheet match={match()} />);
    // formación y DT viven en el mismo <p> ("4-3-3 · DT Pep"); regex = subcadena.
    expect(screen.getByText(/4-3-3/)).toBeDefined();
    expect(screen.getByText(/DT Pep/)).toBeDefined();
    expect(screen.getByText("Ederson")).toBeDefined(); // nombre = nodo de texto propio
    expect(screen.getByText("Ortega")).toBeDefined();
    expect(screen.getByText("Raya")).toBeDefined();
  });
  it("muestra estado vacío si el 11 aún no está publicado", () => {
    render(<LineupSheet match={match({ lineup: null })} />);
    expect(screen.getByText(/por confirmar/i)).toBeDefined();
  });
});
