/**
 * DuelRow (SEN-25, Tarea C). Espejo de src/components/DuelRow.tsx: un duelo
 * próximo homeOwner 🏳 vs 🏳 awayOwner · <kickoff>. Smoke: ambos dueños, ambas
 * banderas, el VS y la etiqueta de cuándo (whenLabel) se renderizan.
 */
import { render, screen } from "@testing-library/react-native";
import type { OverviewData } from "@convex/types";
import { whenLabel } from "@shared/format";

import { DuelRow } from "@/components/DuelRow";

type Duel = OverviewData["upcomingDuels"][number];

const KICKOFF = 1_700_000_000_000;

const duel = (over: Partial<Duel> = {}): Duel => ({
  homeOwner: "Ana",
  homeTeam: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" },
  awayOwner: "Beto",
  awayTeam: { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "A" },
  kickoffAt: KICKOFF,
  ...over,
});

describe("DuelRow", () => {
  it("renderiza ambos dueños, ambas banderas, el VS y la etiqueta de cuándo", () => {
    render(<DuelRow d={duel()} />);

    expect(screen.getByText("Ana")).toBeOnTheScreen();
    expect(screen.getByText("Beto")).toBeOnTheScreen();
    expect(screen.getByText("🇲🇽")).toBeOnTheScreen();
    expect(screen.getByText("🇧🇷")).toBeOnTheScreen();
    expect(screen.getByText("VS")).toBeOnTheScreen();
    expect(screen.getByText(whenLabel(KICKOFF))).toBeOnTheScreen();
  });
});
