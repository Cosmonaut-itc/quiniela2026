// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MatchScoreEditor } from "./MatchScoreEditor";
import type { AdminMatchView } from "@/../convex/types";

const m = (p: Partial<AdminMatchView>): AdminMatchView => ({
  externalId: "m1", stage: "group", label: "Grupos",
  homeTeam: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" },
  awayTeam: { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "A" },
  homeExternalId: "MEX", awayExternalId: "BRA",
  homeScore: null, awayScore: null, status: "scheduled", winnerExternalId: null, manualOverride: false, ...p,
});

describe("MatchScoreEditor", () => {
  it("emite onSave con el marcador (sin ganador en grupos)", () => {
    const onSave = vi.fn();
    render(<MatchScoreEditor matches={[m({})]} savingId={null} onSave={onSave} onRevert={() => {}} />);
    fireEvent.change(screen.getByLabelText("Goles MEX"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Goles BRA"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Guardar marcador"));
    expect(onSave).toHaveBeenCalledWith("m1", 2, 1, undefined);
  });
  it("oculta partidos sin equipos definidos", () => {
    render(<MatchScoreEditor matches={[m({ homeTeam: null })]} savingId={null} onSave={() => {}} onRevert={() => {}} />);
    expect(screen.queryByLabelText("Guardar marcador")).toBeNull();
  });
});
