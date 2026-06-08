// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PredictMatchRow } from "./PredictMatchRow";
import type { ProgolMatchView } from "@/../convex/types";

const base: ProgolMatchView = {
  matchId: "m1", stage: "group", label: "Grupos",
  home: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" },
  away: { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "A" },
  kickoffAt: 2000, state: "predictable", pick: null, result: null, correct: null,
  homeScore: null, awayScore: null,
};

describe("PredictMatchRow", () => {
  it("muestra el acierto cuando el partido terminó", () => {
    render(<PredictMatchRow editable={false} m={{ ...base, state: "finished", pick: "home", result: "home", correct: true, homeScore: 2, awayScore: 0 }} />);
    expect(screen.getByText(/Acertaste/)).toBeDefined();
  });
  it("muestra 'Rival por definir' cuando está pendiente", () => {
    render(<PredictMatchRow editable m={{ ...base, home: null, away: null, state: "pending" }} />);
    expect(screen.getByText("Rival por definir")).toBeDefined();
  });
});
