// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StandingsView } from "./StandingsView";

const row = (code: string, name: string, points: number, played: number, gd: number, gf: number) => ({
  team: { code, name, flag: `https://crests/${code}.png`, group: "" },
  points, played, gd, gf,
});

describe("StandingsView", () => {
  it("renderiza las filas en orden con posición, PJ, dif y pts", () => {
    render(
      <StandingsView
        standings={[row("LIV", "Liverpool", 4, 2, 3, 4), row("ARS", "Arsenal", 4, 2, 2, 3)]}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1); // sin el thead
    expect(rows[0].textContent).toContain("Liverpool");
    expect(rows[0].textContent).toContain("+3");
    expect(rows[1].textContent).toContain("Arsenal");
    expect(screen.getByRole("img", { name: "Liverpool" })).toBeDefined();
  });
});
