/**
 * PredictMatchRow (SEN-26, Tarea 1). Espejo de src/components/PredictMatchRow.tsx.
 * Cubre los 4 estados de la fila de pronóstico (AC#2):
 * - pending: "Rival por definir"; sin botones 1/X/2 ni marcador.
 * - predictable: 3 botones de pronóstico accesibles, ninguno seleccionado,
 *   al pulsar uno se llama onPick(matchId, pick).
 * - locked: botones presentes pero deshabilitados; leyenda según haya pick o no.
 * - finished: marcador + veredicto (✓ Acertaste / ✗ Fallaste / No pronosticaste);
 *   sin botones. Las tres ramas de ResultLine quedan cubiertas.
 * También: predictable con editable=false → botones deshabilitados (tarjeta ajena).
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ProgolMatchView } from "@convex/types";

import { PredictMatchRow } from "@/components/PredictMatchRow";

const MEX = { code: "MEX", name: "México", flag: "🇲🇽", group: "A" };
const BRA = { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "A" };

const match = (over: Partial<ProgolMatchView> = {}): ProgolMatchView => ({
  matchId: "m1",
  stage: "J1",
  label: "Jornada 1",
  matchday: 1,
  home: MEX,
  away: BRA,
  kickoffAt: 1_700_000_000_000,
  state: "predictable",
  pick: null,
  result: null,
  correct: null,
  homeScore: null,
  awayScore: null,
  ...over,
});

describe("PredictMatchRow", () => {
  it("pending → 'Rival por definir'; sin botones ni marcador", () => {
    render(
      <PredictMatchRow
        m={match({ home: null, away: null, state: "pending" })}
        editable
      />,
    );
    expect(screen.getByText("Rival por definir")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Pronóstico Empate")).toBeNull();
    expect(screen.queryByText("2–0")).toBeNull();
  });

  it("predictable → 3 botones accesibles, ninguno seleccionado, onPick al pulsar", () => {
    const onPick = jest.fn();
    render(
      <PredictMatchRow m={match({ state: "predictable", pick: null })} editable onPick={onPick} />,
    );

    const local = screen.getByLabelText("Pronóstico MEX");
    const empate = screen.getByLabelText("Pronóstico Empate");
    const visita = screen.getByLabelText("Pronóstico BRA");
    expect(local).toBeOnTheScreen();
    expect(empate).toBeOnTheScreen();
    expect(visita).toBeOnTheScreen();

    expect(local).not.toBeSelected();
    expect(empate).not.toBeSelected();
    expect(visita).not.toBeSelected();

    fireEvent.press(local);
    expect(onPick).toHaveBeenCalledWith("m1", "home");
  });

  it("predictable con pick → el botón elegido queda seleccionado", () => {
    render(<PredictMatchRow m={match({ state: "predictable", pick: "draw" })} editable />);
    expect(screen.getByLabelText("Pronóstico Empate")).toBeSelected();
    expect(screen.getByLabelText("Pronóstico MEX")).not.toBeSelected();
  });

  it("locked con pick → botones deshabilitados y leyenda 'Tu pronóstico: Local'", () => {
    render(<PredictMatchRow m={match({ state: "locked", pick: "home" })} editable />);
    expect(screen.getByLabelText("Pronóstico MEX")).toBeDisabled();
    expect(screen.getByLabelText("Pronóstico Empate")).toBeDisabled();
    expect(screen.getByLabelText("Pronóstico BRA")).toBeDisabled();
    expect(screen.getByText("Tu pronóstico: Local")).toBeOnTheScreen();
  });

  it("locked sin pick → leyenda 'Sin pronóstico · partido cerrado'", () => {
    render(<PredictMatchRow m={match({ state: "locked", pick: null })} editable />);
    expect(screen.getByText("Sin pronóstico · partido cerrado")).toBeOnTheScreen();
  });

  it("finished acierto → marcador 2–0, '✓ Acertaste'; sin botones", () => {
    render(
      <PredictMatchRow
        m={match({
          state: "finished",
          pick: "home",
          result: "home",
          correct: true,
          homeScore: 2,
          awayScore: 0,
        })}
        editable
      />,
    );
    expect(screen.getByText("2–0")).toBeOnTheScreen();
    expect(screen.getByText(/✓ Acertaste/)).toBeOnTheScreen();
    expect(screen.queryByLabelText("Pronóstico Empate")).toBeNull();
  });

  it("finished fallo → '✗ Fallaste'; sin botones", () => {
    render(
      <PredictMatchRow
        m={match({
          state: "finished",
          pick: "draw",
          result: "home",
          correct: false,
          homeScore: 1,
          awayScore: 0,
        })}
        editable
      />,
    );
    expect(screen.getByText(/✗ Fallaste/)).toBeOnTheScreen();
    expect(screen.queryByLabelText("Pronóstico Empate")).toBeNull();
  });

  it("finished sin pick → 'No pronosticaste · resultado: Local'", () => {
    render(
      <PredictMatchRow
        m={match({
          state: "finished",
          pick: null,
          result: "home",
          correct: null,
          homeScore: 1,
          awayScore: 0,
        })}
        editable
      />,
    );
    expect(screen.getByText("No pronosticaste · resultado: Local")).toBeOnTheScreen();
  });

  it("predictable con editable=false → botones deshabilitados (tarjeta ajena)", () => {
    render(<PredictMatchRow m={match({ state: "predictable" })} editable={false} />);
    expect(screen.getByLabelText("Pronóstico MEX")).toBeDisabled();
    expect(screen.getByLabelText("Pronóstico Empate")).toBeDisabled();
    expect(screen.getByLabelText("Pronóstico BRA")).toBeDisabled();
  });
});
