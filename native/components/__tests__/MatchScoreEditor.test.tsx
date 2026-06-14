import { fireEvent, render, screen } from "@testing-library/react-native";
import type { AdminMatchView } from "@convex/types";
import { MatchScoreEditor } from "@/components/MatchScoreEditor";

const MEX = { code: "MEX", name: "México", flag: "🇲🇽", group: "A" };
const BRA = { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "A" };

function m(over: Partial<AdminMatchView> = {}): AdminMatchView {
  return {
    externalId: "e1",
    stage: "group",
    label: "Grupos",
    homeTeam: MEX,
    awayTeam: BRA,
    homeExternalId: "MEX",
    awayExternalId: "BRA",
    homeScore: null,
    awayScore: null,
    status: "scheduled",
    winnerExternalId: null,
    manualOverride: false,
    ...over,
  };
}

describe("MatchScoreEditor", () => {
  it("sin partidos jugables → muestra el estado vacío", () => {
    render(
      <MatchScoreEditor
        matches={[m({ homeTeam: null, awayTeam: null })]}
        savingId={null}
        onSave={jest.fn()}
        onRevert={jest.fn()}
      />,
    );
    expect(screen.getByText("No hay partidos con equipos definidos todavía.")).toBeOnTheScreen();
  });

  it("grupo → guardar manda los marcadores escritos y winner undefined", () => {
    const onSave = jest.fn();
    render(<MatchScoreEditor matches={[m()]} savingId={null} onSave={onSave} onRevert={jest.fn()} />);
    fireEvent.changeText(screen.getByLabelText("Goles MEX"), "2");
    fireEvent.changeText(screen.getByLabelText("Goles BRA"), "1");
    fireEvent.press(screen.getByLabelText("Guardar marcador"));
    expect(onSave).toHaveBeenCalledWith("e1", 2, 1, undefined);
  });

  it("eliminatorio → elegir ganador manda el externalId del ganador", () => {
    const onSave = jest.fn();
    render(
      <MatchScoreEditor
        matches={[m({ stage: "qf", label: "Cuartos" })]}
        savingId={null}
        onSave={onSave}
        onRevert={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByLabelText("Goles MEX"), "1");
    fireEvent.changeText(screen.getByLabelText("Goles BRA"), "0");
    fireEvent.press(screen.getByLabelText("Pronóstico MEX")); // ganador = local
    fireEvent.press(screen.getByLabelText("Guardar marcador"));
    expect(onSave).toHaveBeenCalledWith("e1", 1, 0, "MEX");
  });

  it("manualOverride → muestra 'editado a mano' y revertir llama onRevert", () => {
    const onRevert = jest.fn();
    render(
      <MatchScoreEditor
        matches={[m({ manualOverride: true })]}
        savingId={null}
        onSave={jest.fn()}
        onRevert={onRevert}
      />,
    );
    expect(screen.getByText("editado a mano")).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText("Volver al automático"));
    expect(onRevert).toHaveBeenCalledWith("e1");
  });
});
