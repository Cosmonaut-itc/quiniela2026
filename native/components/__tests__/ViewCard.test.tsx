/**
 * ViewCard (SEN-26). Tarjeta read-only de pronósticos de OTRO jugador, montada en
 * el PRIMER <Modal> del código nativo (espejo del ViewCardDialog web de
 * src/routes/progol/ProgolGeneral.tsx). Se asierta COMPORTAMIENTO (className es
 * no-op bajo jest; nunca estilos):
 *   - participantId null → el Modal está oculto (visible={false}); su contenido NO
 *     se renderiza (ni título de fallback ni botón Cerrar);
 *   - participantId set + card undefined → subtítulo "Cargando…" + título de
 *     fallback "Pronósticos";
 *   - card poblado → nombre, "Lugar #rank · points pts", el heading de etapa y los
 *     controles de PredictMatchRow en read-only (botón de pronóstico disabled);
 *   - filtra los matches pending: una etapa toda-pending no muestra su heading; un
 *     match pending dentro de una etapa con visibles no aparece;
 *   - pulsar la ✕ (Cerrar) llama onClose.
 *
 * useQuery se mockea despachando por NOMBRE de query (getFunctionName de
 * convex/server): el `api` generado es un Proxy y === falla. getCard → mockCard.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";

import type { ProgolCardData, ProgolMatchView } from "@convex/types";

import { ViewCard } from "@/components/ViewCard";

// react-native-safe-area-context: PredictMatchRow no lo lee, pero el mock oficial
// es inofensivo y mantiene el patrón uniforme de la suite.
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require es la única forma de cargar el mock oficial aquí.
  require("react-native-safe-area-context/jest/mock").default,
);

// convex/react: solo useQuery (getCard). Despacha por NOMBRE.
let mockCard: unknown;
jest.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require carga el helper dentro del factory.
    const { getFunctionName } = require("convex/server");
    const name = getFunctionName(ref);
    if (name === "progol:getCard") return mockCard;
    return undefined;
  },
}));

const team = (code: string, name: string, flag = "🏳️") => ({
  code,
  name,
  flag,
  group: "A",
});

function progolMatch(over: Partial<ProgolMatchView> = {}): ProgolMatchView {
  return {
    matchId: "m1",
    stage: "j1",
    label: "Jornada 1",
    matchday: 1,
    home: team("MEX", "México", "🇲🇽"),
    away: team("BRA", "Brasil", "🇧🇷"),
    kickoffAt: Date.UTC(2026, 5, 20, 18, 0),
    state: "predictable",
    pick: null,
    result: null,
    correct: null,
    homeScore: null,
    awayScore: null,
    ...over,
  };
}

// Tarjeta de María: etapa 1 con un partido predictable (ARG) y uno pending; etapa
// 2 toda-pending (no debe mostrar heading).
function card(over: Partial<ProgolCardData> = {}): ProgolCardData {
  return {
    mode: "progol",
    quinielaId: "Q1",
    quinielaName: "La Progol del Barrio",
    joinToken: "jt",
    prize: { mode: "fixed", text: "", entryFee: null, pool: null, contributors: 0 },
    status: "open",
    who: {
      participantId: "p1",
      name: "María",
      photoUrl: null,
      points: 7,
      rank: 2,
      correct: 3,
      played: 5,
    },
    stages: [
      {
        stage: "j1",
        label: "Jornada 1",
        // El label del MATCH se deja distinto del label de la ETAPA ("Jornada 1")
        // a propósito: así getByText("Jornada 1") identifica el heading de etapa de
        // forma única aunque PredictMatchRow evolucione y llegue a pintar m.label.
        matches: [
          progolMatch({ matchId: "j1m1", label: "Partido A", home: team("ARG", "Argentina", "🇦🇷"), away: team("CHI", "Chile", "🇨🇱") }),
          progolMatch({ matchId: "j1m2", label: "Partido B", state: "pending", home: team("USA", "Estados Unidos", "🇺🇸"), away: null }),
        ],
      },
      {
        stage: "j2",
        label: "Jornada 2",
        matches: [
          progolMatch({ matchId: "j2m1", state: "pending", label: "Jornada 2", stage: "j2", home: null, away: null }),
        ],
      },
    ],
    currentRonda: "Jornada 1",
    ...over,
  };
}

beforeEach(() => {
  mockCard = undefined;
});

describe("ViewCard — Modal oculto", () => {
  it("participantId null → no renderiza el contenido (Modal cerrado)", () => {
    mockCard = undefined;
    render(<ViewCard joinToken="jt" participantId={null} onClose={jest.fn()} />);
    // Con visible={false} el Modal de RN no monta su contenido.
    expect(screen.queryByText("Pronósticos")).toBeNull();
    expect(screen.queryByLabelText("Cerrar")).toBeNull();
  });
});

describe("ViewCard — cargando", () => {
  it("participantId set + card undefined → título de fallback y subtítulo Cargando…", () => {
    mockCard = undefined;
    render(<ViewCard joinToken="jt" participantId="p1" onClose={jest.fn()} />);
    expect(screen.getByText("Pronósticos")).toBeOnTheScreen();
    expect(screen.getByText("Cargando…")).toBeOnTheScreen();
  });
});

describe("ViewCard — tarjeta poblada", () => {
  it("muestra nombre, lugar/puntos, el heading de etapa y el control read-only", () => {
    mockCard = card();
    render(<ViewCard joinToken="jt" participantId="p1" onClose={jest.fn()} />);

    expect(screen.getByText("María")).toBeOnTheScreen();
    expect(screen.getByText("Lugar #2 · 7 pts")).toBeOnTheScreen();
    // Heading de la etapa con partidos visibles.
    expect(screen.getByText("Jornada 1")).toBeOnTheScreen();
    // El partido ARG es predictable pero la tarjeta es read-only (editable=false):
    // su botón de pronóstico está deshabilitado.
    expect(screen.getByLabelText("Pronóstico ARG")).toBeDisabled();
  });

  it("filtra los pending: la etapa toda-pending no muestra heading, el match pending no aparece", () => {
    mockCard = card();
    render(<ViewCard joinToken="jt" participantId="p1" onClose={jest.fn()} />);

    // La Jornada 2 es toda-pending → su heading NO aparece.
    expect(screen.queryByText("Jornada 2")).toBeNull();
    // El match pending de la Jornada 1 (USA) no se renderiza (filtrado).
    expect(screen.queryByLabelText("Pronóstico USA")).toBeNull();
  });
});

describe("ViewCard — cerrar", () => {
  it("pulsar la ✕ (Cerrar) llama onClose", () => {
    const onClose = jest.fn();
    mockCard = card();
    render(<ViewCard joinToken="jt" participantId="p1" onClose={onClose} />);

    fireEvent.press(screen.getByLabelText("Cerrar"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("pulsar el backdrop (Cerrar tarjeta) también llama onClose", () => {
    // El overlay es el mecanismo principal de cierre en una hoja inferior iOS:
    // se cubre aparte del botón ✕ para que un refactor del backdrop no pase mudo.
    const onClose = jest.fn();
    mockCard = card();
    render(<ViewCard joinToken="jt" participantId="p1" onClose={onClose} />);

    fireEvent.press(screen.getByLabelText("Cerrar tarjeta"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
