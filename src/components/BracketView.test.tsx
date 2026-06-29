// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BracketView } from "./BracketView";
import { whenLabel } from "@shared/format";
import type { MundialData } from "@/../convex/types";

const KICKOFF = Date.UTC(2026, 5, 13, 18, 30); // 13 jun 2026 18:30 UTC

const MEX = { code: "MEX", name: "México", flag: "🇲🇽", group: "A" };
const BRA = { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "B" };

describe("BracketView fechas", () => {
  it("muestra la fecha del partido programado usando whenLabel", () => {
    const bracket: MundialData["bracket"] = [{
      stage: "r16",
      label: "Octavos",
      matches: [{
        home: { team: MEX, owner: "Ana" },
        away: { team: BRA, owner: "Beto" },
        homeScore: null, awayScore: null, winnerTeamId: null,
        status: "scheduled", kickoffAt: KICKOFF,
      }],
    }];
    render(<BracketView bracket={bracket} />);
    expect(screen.getByText(whenLabel(KICKOFF))).toBeDefined();
  });

  it("muestra la fecha aunque los equipos estén 'Por definir' (partido futuro)", () => {
    const bracket: MundialData["bracket"] = [{
      stage: "final",
      label: "Final",
      matches: [{
        home: null,
        away: null,
        homeScore: null, awayScore: null, winnerTeamId: null,
        status: "scheduled", kickoffAt: KICKOFF,
      }],
    }];
    render(<BracketView bracket={bracket} />);
    expect(screen.getByText(whenLabel(KICKOFF))).toBeDefined();
  });
});
