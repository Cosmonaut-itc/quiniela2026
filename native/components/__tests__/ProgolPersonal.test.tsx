/**
 * ProgolPersonal (SEN-26). Port del panel personal Progol (espejo de
 * src/routes/progol/ProgolPersonal.tsx): pronosticar 1/X/2 con navegación por
 * Ronda. Se asierta COMPORTAMIENTO (className es no-op bajo jest; nunca estilos):
 *   - data/mode === undefined → estado de carga (Cargando), NO el nombre;
 *   - liga aterriza en currentRonda y muestra solo esa jornada (◀▶);
 *   - la navegación de Ronda avanza/retrocede y deshabilita en los extremos;
 *   - tocar un pronóstico llama predict con { personalToken, matchId, pick };
 *   - un partido locked deshabilita sus botones y muestra la leyenda de cierre;
 *   - en eliminatorio se muestran TODAS las etapas y no hay chevrons.
 *
 * useQuery/useMutation se mockean despachando por NOMBRE de función: el `api`
 * generado es un Proxy que crea una referencia NUEVA por cada acceso (=== falla),
 * así que se desambigua con getFunctionName (convex/server). useMutation devuelve
 * un mock que registra las llamadas a predict.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import type { Pick, ProgolCardData, ProgolMatchView } from "@convex/types";

import { ProgolPersonal } from "@/components/views/ProgolPersonal";

// react-native-safe-area-context: Shell/BottomNav leen useSafeAreaInsets. El mock
// oficial devuelve insets en 0 (irrelevante para aserciones de comportamiento).
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require es la única forma de cargar el mock oficial del paquete aquí.
  require("react-native-safe-area-context/jest/mock").default,
);

// expo-router: BottomNav (dentro del Shell) y el link al torneo usan router.push;
// se mockea para no montar el router real.
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

// @/lib/storage: BottomNav persiste/lee tokens; por defecto getToken → null.
jest.mock("@/lib/storage", () => ({
  getToken: jest.fn(async () => null),
  setToken: jest.fn(async () => undefined),
}));

// convex/react: useQuery despacha por NOMBRE (ver cabecera). useMutation devuelve
// el mock de predict que registra { personalToken, matchId, pick }.
let mockPersonal: unknown;
let mockMode: unknown;
// Prefijo `mock`: jest permite referenciar variables con ese prefijo dentro del
// factory hoisted de jest.mock (la guardia de variables fuera de scope).
const mockPredict = jest.fn(async () => undefined);
jest.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require carga el helper dentro del factory.
    const { getFunctionName } = require("convex/server");
    const name = getFunctionName(ref);
    if (name === "progol:getPersonal") return mockPersonal;
    if (name === "quinielas:getMode") return mockMode;
    return undefined;
  },
  useMutation: () => mockPredict,
}));

const team = (code: string, name: string, flag = "🏳️") => ({
  code,
  name,
  flag,
  group: "A",
});

// Una fila ProgolMatchView con defaults "predictable" sin pick.
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

// Tarjeta Progol con 3 jornadas (códigos distintos por jornada para distinguir
// qué jornada está visible) y currentRonda en la del medio. La jornada 2 incluye
// un partido predictable (ARG) y uno locked (GER) para cubrir AC#1 y AC#5.
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
        matches: [
          progolMatch({ matchId: "j1m1", stage: "j1", label: "Jornada 1", matchday: 1, home: team("MEX", "México", "🇲🇽"), away: team("USA", "Estados Unidos", "🇺🇸") }),
        ],
      },
      {
        stage: "j2",
        label: "Jornada 2",
        matches: [
          progolMatch({ matchId: "j2m1", stage: "j2", label: "Jornada 2", matchday: 2, home: team("ARG", "Argentina", "🇦🇷"), away: team("CHI", "Chile", "🇨🇱") }),
          progolMatch({ matchId: "j2m2", stage: "j2", label: "Jornada 2", matchday: 2, state: "locked", pick: "home", home: team("GER", "Alemania", "🇩🇪"), away: team("ESP", "España", "🇪🇸") }),
        ],
      },
      {
        stage: "j3",
        label: "Jornada 3",
        matches: [
          progolMatch({ matchId: "j3m1", stage: "j3", label: "Jornada 3", matchday: 3, home: team("ESP", "España", "🇪🇸"), away: team("FRA", "Francia", "🇫🇷") }),
        ],
      },
    ],
    currentRonda: "Jornada 2",
    ...over,
  };
}

const ligaMode = {
  gameMode: "progol" as const,
  tournament: { code: "ligamx", shortName: "LIGA", format: "liga" as const },
};

beforeEach(() => {
  mockPredict.mockClear();
  (router.push as jest.Mock).mockClear();
  mockPersonal = undefined;
  mockMode = ligaMode;
});

describe("ProgolPersonal — carga", () => {
  it("data === undefined → muestra Cargando, no el nombre", () => {
    mockPersonal = undefined;
    mockMode = ligaMode;
    render(<ProgolPersonal quinielaId="Q1" personalToken="mt" />);
    expect(screen.getByText("Cargando…")).toBeOnTheScreen();
    expect(screen.queryByText("María")).toBeNull();
  });

  it("mode === undefined → muestra Cargando aunque haya data", () => {
    mockPersonal = card();
    mockMode = undefined;
    render(<ProgolPersonal quinielaId="Q1" personalToken="mt" />);
    expect(screen.getByText("Cargando…")).toBeOnTheScreen();
    expect(screen.queryByText("María")).toBeNull();
  });
});

describe("ProgolPersonal — liga: aterriza en currentRonda", () => {
  it("muestra la jornada actual (J2) y sus equipos; oculta J1 y J3; con chevrons", () => {
    mockPersonal = card();
    render(<ProgolPersonal quinielaId="Q1" personalToken="mt" />);

    // Header con nombre y quiniela.
    expect(screen.getByText("María")).toBeOnTheScreen();
    expect(screen.getByText("La Progol del Barrio")).toBeOnTheScreen();
    // Aterriza en "Jornada 2" (currentRonda).
    expect(screen.getByText("Jornada 2")).toBeOnTheScreen();
    // J2 visible vía su control de pronóstico (ARG); J1 (USA) y J3 (FRA) no.
    // Se asierta por el accessibilityLabel del PickSelector (único por
    // partido-lado), no por el código suelto: en un partido predictable el código
    // aparece dos veces (header + opción del selector) y getByText lanzaría.
    expect(screen.getByLabelText("Pronóstico ARG")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Pronóstico USA")).toBeNull();
    expect(screen.queryByLabelText("Pronóstico FRA")).toBeNull();
    // Chevrons presentes.
    expect(screen.getByLabelText("Jornada anterior")).toBeOnTheScreen();
    expect(screen.getByLabelText("Jornada siguiente")).toBeOnTheScreen();
  });
});

describe("ProgolPersonal — liga: navegación de Ronda ◀▶", () => {
  it("avanzar lleva a J3 y deshabilita 'Jornada siguiente' (último)", () => {
    mockPersonal = card();
    render(<ProgolPersonal quinielaId="Q1" personalToken="mt" />);

    fireEvent.press(screen.getByLabelText("Jornada siguiente"));
    expect(screen.getByText("Jornada 3")).toBeOnTheScreen();
    expect(screen.getByLabelText("Pronóstico ESP")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Pronóstico ARG")).toBeNull();
    expect(screen.getByLabelText("Jornada siguiente")).toBeDisabled();
  });

  it("retroceder hasta el inicio deshabilita 'Jornada anterior'", () => {
    mockPersonal = card();
    render(<ProgolPersonal quinielaId="Q1" personalToken="mt" />);

    fireEvent.press(screen.getByLabelText("Jornada anterior")); // J2 → J1
    expect(screen.getByText("Jornada 1")).toBeOnTheScreen();
    expect(screen.getByLabelText("Pronóstico USA")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Pronóstico ARG")).toBeNull();
    expect(screen.getByLabelText("Jornada anterior")).toBeDisabled();
  });
});

describe("ProgolPersonal — liga: sin ronda en curso", () => {
  it("currentRonda null → aterriza en la primera jornada y 'Jornada anterior' deshabilitado", () => {
    // Quiniela recién creada sin jornada activa: activeRonda es null, indexOf da
    // -1 y idx cae a 0 (primera jornada). Verifica ese path de fallback.
    mockPersonal = card({ currentRonda: null });
    render(<ProgolPersonal quinielaId="Q1" personalToken="mt" />);

    expect(screen.getByText("Jornada 1")).toBeOnTheScreen();
    expect(screen.getByLabelText("Pronóstico USA")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Pronóstico ARG")).toBeNull();
    expect(screen.getByLabelText("Jornada anterior")).toBeDisabled();
    expect(screen.getByLabelText("Jornada siguiente")).not.toBeDisabled();
  });
});

describe("ProgolPersonal — pronosticar (AC#1)", () => {
  it("tocar un pronóstico llama predict con personalToken, matchId y pick", () => {
    mockPersonal = card();
    render(<ProgolPersonal quinielaId="Q1" personalToken="mt" />);

    // J2 está activa: el partido ARG es predictable. "Pronóstico ARG" es el botón
    // del local (home).
    fireEvent.press(screen.getByLabelText("Pronóstico ARG"));
    expect(mockPredict).toHaveBeenCalledWith(
      expect.objectContaining({ personalToken: "mt", matchId: "j2m1", pick: "home" as Pick }),
    );
  });
});

describe("ProgolPersonal — partido bloqueado (AC#5)", () => {
  it("los botones del partido locked están deshabilitados y se ve la leyenda", () => {
    mockPersonal = card();
    render(<ProgolPersonal quinielaId="Q1" personalToken="mt" />);

    // El partido GER (j2m2) está locked con pick "home" → botones disabled y
    // leyenda "Tu pronóstico: Local".
    expect(screen.getByLabelText("Pronóstico GER")).toBeDisabled();
    expect(screen.getByText("Tu pronóstico: Local")).toBeOnTheScreen();
  });
});

describe("ProgolPersonal — eliminatorio", () => {
  it("muestra todas las etapas y no hay chevrons", () => {
    mockPersonal = card({
      currentRonda: "Octavos",
      stages: [
        {
          stage: "r16",
          label: "Octavos",
          matches: [progolMatch({ matchId: "o1", stage: "r16", label: "Octavos", matchday: null, home: team("MEX", "México", "🇲🇽"), away: team("USA", "Estados Unidos", "🇺🇸") })],
        },
        {
          stage: "qf",
          label: "Cuartos",
          matches: [progolMatch({ matchId: "q1", stage: "qf", label: "Cuartos", matchday: null, home: team("ARG", "Argentina", "🇦🇷"), away: team("BRA", "Brasil", "🇧🇷") })],
        },
      ],
    });
    mockMode = {
      gameMode: "progol" as const,
      tournament: { code: "wc26", shortName: "Mundial 26", format: "eliminatorio" as const },
    };
    render(<ProgolPersonal quinielaId="Q1" personalToken="mt" />);

    // Ambas etapas visibles (sus headings y un control de pronóstico de cada una).
    expect(screen.getByText("Octavos")).toBeOnTheScreen();
    expect(screen.getByText("Cuartos")).toBeOnTheScreen();
    expect(screen.getByLabelText("Pronóstico USA")).toBeOnTheScreen();
    expect(screen.getByLabelText("Pronóstico BRA")).toBeOnTheScreen();
    // Sin navegación de jornada.
    expect(screen.queryByLabelText("Jornada anterior")).toBeNull();
    expect(screen.queryByLabelText("Jornada siguiente")).toBeNull();
  });
});

describe("ProgolPersonal — link al torneo", () => {
  it("tocar el link navega a /q/[id]/torneo con el id de la quiniela", () => {
    mockPersonal = card();
    render(<ProgolPersonal quinielaId="Q1" personalToken="mt" />);

    // En liga el label es "Ver tabla de posiciones del torneo".
    fireEvent.press(screen.getByLabelText("Ver tabla de posiciones del torneo"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/q/[id]/torneo",
      params: { id: "Q1" },
    });
  });
});
