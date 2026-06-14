/**
 * ProgolGeneral (SEN-26). Port de la invitación/general Progol (espejo de
 * src/routes/progol/ProgolGeneral.tsx): header + tabla de posiciones + tarjeta
 * ajena (ViewCard, en Modal) + CTA de inscripción. Gemela de JoinClasica. Se
 * asierta COMPORTAMIENTO (className es no-op bajo jest; nunca estilos):
 *   - getGeneral === undefined → estado de carga (Cargando), NO el nombre;
 *   - header: quiniela.name, "{n} jugadores · Inscripciones abiertas"; SectionHeading
 *     "Tabla de posiciones" con "{decidedMatches} jugados"; Leaderboard con filas;
 *   - tocar una fila del Leaderboard abre la tarjeta ajena (ViewCard) → muestra el
 *     contenido de la tarjeta (Lugar/puntos + heading de etapa);
 *   - CTA tri-estado, atado a la lectura async del token "me":
 *       sin token + open → FormularioUnirse ("🎯 Unirme a la quiniela");
 *       sin token + locked → card "Las inscripciones ya están cerradas." (sin form);
 *       token guardado → CTA oculto (ni form ni card de cerradas);
 *   - link al torneo: label condicional por formato (liga vs eliminatorio); pulsarlo
 *     navega a /q/[id]/torneo con el id.
 *
 * useQuery/useMutation se mockean despachando por NOMBRE de función (getFunctionName
 * de convex/server): el `api` generado es un Proxy y === falla. getGeneral →
 * mockGeneral, getMode → mockMode, getCard → mockCard. useMutation → mockJoin.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import { router } from "expo-router";
import type { ReactNode } from "react";

import type { ProgolCardData, ProgolGeneralData, ProgolMatchView } from "@convex/types";

import { ProgolGeneral } from "@/components/views/ProgolGeneral";

// react-native-safe-area-context: Shell/BottomNav leen useSafeAreaInsets. El mock
// oficial devuelve insets en 0 (irrelevante para aserciones de comportamiento).
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require es la única forma de cargar el mock oficial aquí.
  require("react-native-safe-area-context/jest/mock").default,
);

// expo-router: BottomNav, el link al torneo y unirse usan router.push/replace.
const mockReplace = jest.fn<void, [unknown]>();
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: (arg: unknown) => mockReplace(arg) },
}));

// @/lib/storage: BottomNav persiste/lee tokens y la vista lee el token "me".
// Por defecto getToken resuelve null (sin token guardado).
const mockGetToken = jest.fn<Promise<string | null>, [string, string]>(
  async () => null,
);
const mockSetToken = jest.fn<Promise<void>, [string, string, string]>(
  async () => undefined,
);
jest.mock("@/lib/storage", () => ({
  getToken: (id: string, kind: string) => mockGetToken(id, kind),
  setToken: (id: string, kind: string, token: string) =>
    mockSetToken(id, kind, token),
}));

// convex/react: useQuery despacha por NOMBRE; useMutation → mockJoin (inscripción).
let mockGeneral: unknown;
let mockMode: unknown;
let mockCard: unknown;
const mockJoin = jest.fn();
jest.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require carga el helper dentro del factory.
    const { getFunctionName } = require("convex/server");
    const name = getFunctionName(ref);
    if (name === "progol:getGeneral") return mockGeneral;
    if (name === "quinielas:getMode") return mockMode;
    if (name === "progol:getCard") return mockCard;
    return undefined;
  },
  useMutation: () => mockJoin,
}));

const team = (code: string, name: string, flag = "🏳️") => ({
  code,
  name,
  flag,
  group: "A",
});

const ligaMode = {
  gameMode: "progol" as const,
  tournament: { code: "ligamx", shortName: "LIGA", format: "liga" as const },
};
const eliminatorioMode = {
  gameMode: "progol" as const,
  tournament: { code: "wc26", shortName: "Mundial 26", format: "eliminatorio" as const },
};

function general(over: Partial<ProgolGeneralData> = {}): ProgolGeneralData {
  return {
    mode: "progol",
    quiniela: {
      name: "La Progol del Barrio",
      photoUrl: null,
      prize: { mode: "fixed", text: "", entryFee: null, pool: null, contributors: 0 },
      status: "open",
      filledCount: 3,
      notes: null,
    },
    leaderboard: [
      {
        participantId: "p1",
        name: "María",
        photoUrl: null,
        points: 7,
        correct: 3,
        played: 5,
        rank: 1,
      },
      {
        participantId: "p2",
        name: "Pedro",
        photoUrl: null,
        points: 4,
        correct: 2,
        played: 5,
        rank: 2,
      },
    ],
    decidedMatches: 5,
    winnerParticipantIds: [],
    ...over,
  };
}

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
      rank: 1,
      correct: 3,
      played: 5,
    },
    stages: [
      {
        stage: "j1",
        label: "Jornada 1",
        matches: [
          progolMatch({ matchId: "j1m1", home: team("ARG", "Argentina", "🇦🇷"), away: team("CHI", "Chile", "🇨🇱") }),
        ],
      },
    ],
    currentRonda: "Jornada 1",
    ...over,
  };
}

beforeEach(() => {
  mockGeneral = undefined;
  mockMode = ligaMode;
  mockCard = undefined;
  mockReplace.mockClear();
  (router.push as jest.Mock).mockClear();
  mockJoin.mockReset();
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue(null);
  mockSetToken.mockReset();
  mockSetToken.mockResolvedValue(undefined);
});

// HeroUINativeProvider: FormularioUnirse usa el TextField de heroui-native, que lee
// el contexto de animaciones del provider. Sin él el TextField revienta al montar.
function Wrapper({ children }: { children: ReactNode }) {
  return <HeroUINativeProvider>{children}</HeroUINativeProvider>;
}

// Renderiza la vista y DRENA las lecturas async del Keychain (getToken("me") de la
// vista + los fallbacks del BottomNav) dentro de act, de modo que el setLectura/
// setFallback diferido se asiente antes de las aserciones síncronas.
async function renderGeneral() {
  render(<ProgolGeneral quinielaId="Q1" joinToken="jt" />, { wrapper: Wrapper });
  await act(async () => {});
}

describe("ProgolGeneral — carga", () => {
  it("getGeneral === undefined → muestra Cargando, no el nombre", async () => {
    mockGeneral = undefined;
    await renderGeneral();
    expect(screen.getByText("Cargando…")).toBeOnTheScreen();
    expect(screen.queryByText("La Progol del Barrio")).toBeNull();
  });
});

describe("ProgolGeneral — render general", () => {
  it("header, SectionHeading con jugados y el Leaderboard con filas", async () => {
    mockGeneral = general();
    await renderGeneral();
    expect(screen.getByText("La Progol del Barrio")).toBeOnTheScreen();
    expect(
      screen.getByText(/3 jugadores · Inscripciones abiertas/),
    ).toBeOnTheScreen();
    // El SectionHeading compone "Tabla de posiciones " + un <Text> anidado
    // "5 jugados": RNTL aplana el nodo padre (regex sobre el texto combinado) y
    // el nodo hijo conserva su match exacto.
    expect(screen.getByText(/Tabla de posiciones/)).toBeOnTheScreen();
    expect(screen.getByText("5 jugados")).toBeOnTheScreen();
    // Leaderboard: al menos un jugador.
    expect(screen.getByText("María")).toBeOnTheScreen();
    expect(screen.getByText("Pedro")).toBeOnTheScreen();
  });

  it("filledCount === 1 → singular 'jugador'", async () => {
    mockGeneral = general({
      quiniela: { ...general().quiniela, filledCount: 1 },
    });
    await renderGeneral();
    expect(screen.getByText(/1 jugador · Inscripciones abiertas/)).toBeOnTheScreen();
  });

  it("muestra las notas cuando notes está presente", async () => {
    mockGeneral = general({
      quiniela: { ...general().quiniela, notes: "Pago en efectivo." },
    });
    await renderGeneral();
    expect(screen.getByText("Notas")).toBeOnTheScreen();
    expect(screen.getByText("Pago en efectivo.")).toBeOnTheScreen();
  });
});

describe("ProgolGeneral — abrir tarjeta ajena (ViewCard)", () => {
  it("tocar una fila del leaderboard abre la tarjeta y muestra su contenido", async () => {
    mockGeneral = general();
    mockCard = card();
    await renderGeneral();

    // El Modal está cerrado: el subtítulo de la tarjeta aún no aparece.
    expect(screen.queryByText("Lugar #1 · 7 pts")).toBeNull();

    fireEvent.press(screen.getByLabelText("Ver tarjeta de María"));

    // Ahora el Modal está visible con el contenido de la tarjeta.
    expect(screen.getByText("Lugar #1 · 7 pts")).toBeOnTheScreen();
    expect(screen.getByLabelText("Pronóstico ARG")).toBeDisabled();
  });
});

describe("ProgolGeneral — CTA tri-estado", () => {
  it("sin token + open → FormularioUnirse (🎯 Unirme a la quiniela)", async () => {
    mockGeneral = general();
    await renderGeneral();
    expect(screen.getByText("🎯 Unirme a la quiniela")).toBeOnTheScreen();
    expect(screen.getByText("Confirmar inscripción")).toBeOnTheScreen();
  });

  it("sin token + locked → card 'Las inscripciones ya están cerradas.' (sin form)", async () => {
    mockGeneral = general({
      quiniela: { ...general().quiniela, status: "locked" },
    });
    await renderGeneral();
    expect(
      screen.getByText("Las inscripciones ya están cerradas."),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Confirmar inscripción")).toBeNull();
  });

  it("token 'me' guardado → CTA oculto (ni form ni card de cerradas)", async () => {
    mockGetToken.mockImplementation(async (_id: string, kind: string) =>
      kind === "me" ? "stored-mt" : null,
    );
    mockGeneral = general();
    await renderGeneral();
    expect(mockGetToken).toHaveBeenCalledWith("Q1", "me");
    expect(screen.queryByText("Confirmar inscripción")).toBeNull();
    expect(screen.queryByText(/inscripciones ya están cerradas/)).toBeNull();
  });

  it("flujo de unirse: confirmar → join, setToken('me') y router.replace", async () => {
    mockJoin.mockResolvedValue({ personalToken: "new-mt" });
    mockGeneral = general();
    await renderGeneral();

    fireEvent.changeText(screen.getByPlaceholderText("Ej. María"), "Lucía");
    fireEvent.press(screen.getByText("Confirmar inscripción"));

    await waitFor(() =>
      expect(mockJoin).toHaveBeenCalledWith({ joinToken: "jt", name: "Lucía" }),
    );
    await waitFor(() => {
      expect(mockSetToken).toHaveBeenCalledWith("Q1", "me", "new-mt");
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/q/[id]/me/[token]",
        params: { id: "Q1", token: "new-mt" },
      });
    });
  });
});

describe("ProgolGeneral — link al torneo", () => {
  it("liga: label 'Ver tabla de posiciones del torneo' y navega a /q/[id]/torneo", async () => {
    mockGeneral = general();
    mockMode = ligaMode;
    await renderGeneral();

    fireEvent.press(screen.getByLabelText("Ver tabla de posiciones del torneo"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/q/[id]/torneo",
      params: { id: "Q1" },
    });
  });

  it("eliminatorio: label 'Ver grupos y bracket del Mundial'", async () => {
    mockGeneral = general();
    mockMode = eliminatorioMode;
    await renderGeneral();
    expect(
      screen.getByText("Ver grupos y bracket del Mundial"),
    ).toBeOnTheScreen();
  });
});
