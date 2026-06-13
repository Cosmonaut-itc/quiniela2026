/**
 * JoinClasica (SEN-25, Tarea G). Port de la rama Clásica de src/routes/Join.tsx
 * (la rama Progol y los skeletons de LoadingState NO se portan aquí). Se asierta
 * COMPORTAMIENTO (className es no-op bajo jest; nunca estilos computados):
 *   - data === undefined → estado de carga (Cargando), NO el header;
 *   - header: quiniela.name, la línea "{filledCount} de {numParticipants} lugares",
 *     el statusLabel por status, y el PrizeBanner cuando prizeBanner(...) es truthy;
 *   - notas: visibles (con heading "Notas") cuando notes; ausentes cuando null;
 *   - banner de sorteo en vivo: presente solo con assignMode "on_reveal" + status "open";
 *   - PlayersTable: renderiza los nombres de los jugadores y el header "Tabla de jugadores · N";
 *   - upcomingDuels: una DuelRow por duelo (ambos dueños) cuando hay; el heading
 *     "Próximos duelos entre ustedes" ausente cuando está vacío;
 *   - CTA tri-estado, atado a la lectura async del token "me":
 *       token guardado → CTA OCULTO (sin FormularioUnirse ni card de cerradas);
 *       sin token + open + freeSlots>0 (canJoin) → FormularioUnirse;
 *       sin token + no canJoin → card "cerradas/llena" con la copia correcta;
 *   - link al Mundial (accessibilityRole "link");
 *   - flujo de unirse: escribir nombre + confirmar → join({joinToken,name}),
 *     setToken(id,"me",personalToken), router.replace a /q/[id]/me/[token].
 *
 * useQuery se mockea despachando por NOMBRE de query: el generated `api` es un
 * Proxy que crea una referencia NUEVA por cada acceso a propiedad (no se puede
 * comparar por ===), así que se desambigua con getFunctionName (convex/server),
 * que da el nombre estable ("quinielas:getMode" / "quinielas:getOverview").
 * useMutation devuelve un jest fn (la mutación join).
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { HeroUINativeProvider } from "heroui-native";
import type { ReactNode } from "react";

import type { OverviewData } from "@convex/types";

import { JoinClasica } from "@/components/views/JoinClasica";

// react-native-safe-area-context: Shell/BottomNav leen useSafeAreaInsets. El mock
// oficial devuelve insets en 0 (irrelevante para aserciones de comportamiento).
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require es la única forma de cargar el mock oficial del paquete aquí.
  require("react-native-safe-area-context/jest/mock").default,
);

// expo-router: BottomNav (dentro del Shell), el link Mundial y unirse usan
// router.push / router.replace; se mockean para no montar el router real.
const mockReplace = jest.fn<void, [unknown]>();
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: (arg: unknown) => mockReplace(arg) },
}));

// @/lib/storage: BottomNav persiste/lee tokens y la vista lee el token "me".
// Por defecto getToken resuelve null (sin token guardado); los tests que
// necesitan un valor lo sobreescriben con mockImplementation.
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

// convex/react: useQuery despacha por NOMBRE de query (ver cabecera); useMutation
// devuelve el jest fn `mockJoin` (la mutación de inscripción).
let mockModeValue: unknown;
let mockOverviewValue: unknown;
const mockJoin = jest.fn();
jest.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require carga el helper dentro del factory.
    const { getFunctionName } = require("convex/server");
    const name = getFunctionName(ref);
    if (name === "quinielas:getMode") return mockModeValue;
    if (name === "quinielas:getOverview") return mockOverviewValue;
    return undefined;
  },
  useMutation: () => mockJoin,
}));

const mode = {
  gameMode: "clasica" as const,
  tournament: { code: "wc26", shortName: "Mundial 26", format: "eliminatorio" as const },
};

const teamLite = (name: string, flag = "🏳️") => ({
  code: name.slice(0, 3).toUpperCase(),
  name,
  flag,
  group: "A",
});

function overview(over: Partial<OverviewData> = {}): OverviewData {
  return {
    quiniela: {
      name: "La Quiniela del Barrio",
      photoUrl: null,
      prize: { mode: "fixed", text: "", entryFee: null, pool: null, contributors: 0 },
      numParticipants: 8,
      filledCount: 3,
      status: "open",
      assignMode: "on_join",
      notes: null,
    },
    players: [],
    freeSlots: 5,
    upcomingDuels: [],
    ...over,
  };
}

beforeEach(() => {
  mockModeValue = mode;
  mockOverviewValue = undefined;
  mockReplace.mockClear();
  mockJoin.mockReset();
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue(null);
  mockSetToken.mockReset();
  mockSetToken.mockResolvedValue(undefined);
});

// HeroUINativeProvider: FormularioUnirse (rama canJoin) usa el TextField de
// heroui-native, que lee el contexto de animaciones del provider (igual que el
// árbol real en app/_layout.tsx). Sin él, useGlobalAnimationSettings() es
// undefined y el TextField revienta al montar. Se monta como wrapper de render.
function Wrapper({ children }: { children: ReactNode }) {
  return <HeroUINativeProvider>{children}</HeroUINativeProvider>;
}

// Renderiza la vista y DRENA las lecturas async del Keychain (el getToken("me")
// de la vista + los dos fallbacks del BottomNav) dentro de act, de modo que el
// setLectura/setFallback diferido se asiente antes de cualquier aserción. Sin
// esto, los tests síncronos disparan un setState fuera de act (warning) y, en la
// suite completa, el error escala a un fallo de render. Espejo del patrón de
// BottomNav.test.tsx, encapsulado para los tests síncronos de esta vista.
async function renderJoin() {
  render(<JoinClasica quinielaId="Q1" joinToken="jt" />, { wrapper: Wrapper });
  // microtask flush: resuelve las promesas de getToken dentro de act.
  await act(async () => {});
}

describe("JoinClasica — carga", () => {
  it("getOverview === undefined → muestra Cargando, no el header", async () => {
    mockOverviewValue = undefined;
    await renderJoin();
    expect(screen.getByText("Cargando…")).toBeOnTheScreen();
    expect(screen.queryByText("La Quiniela del Barrio")).toBeNull();
  });
});

describe("JoinClasica — header", () => {
  it("muestra nombre y la línea de lugares con el statusLabel (open)", async () => {
    mockOverviewValue = overview();
    await renderJoin();
    expect(screen.getByText("La Quiniela del Barrio")).toBeOnTheScreen();
    expect(
      screen.getByText(/3 de 8 lugares · Inscripciones abiertas/),
    ).toBeOnTheScreen();
  });

  it("statusLabel locked", async () => {
    mockOverviewValue = overview({
      quiniela: { ...overview().quiniela, status: "locked" },
    });
    await renderJoin();
    expect(
      screen.getByText(/Inscripciones cerradas/),
    ).toBeOnTheScreen();
  });

  it("statusLabel finished", async () => {
    mockOverviewValue = overview({
      quiniela: { ...overview().quiniela, status: "finished" },
    });
    await renderJoin();
    expect(screen.getByText(/Mundial finalizado/)).toBeOnTheScreen();
  });

  it("muestra el PrizeBanner cuando prizeBanner(...) es truthy", async () => {
    mockOverviewValue = overview({
      quiniela: {
        ...overview().quiniela,
        prize: { mode: "fixed", text: "Una lana", entryFee: null, pool: null, contributors: 0 },
      },
    });
    await renderJoin();
    // prizeBanner(fixed "Una lana", open, " al campeón") → title "Una lana al campeón".
    expect(screen.getByText("Una lana al campeón")).toBeOnTheScreen();
  });

  it("oculta el PrizeBanner cuando prizeBanner(...) es null (fixed sin texto)", async () => {
    mockOverviewValue = overview();
    await renderJoin();
    expect(screen.queryByText(/al campeón/)).toBeNull();
  });
});

describe("JoinClasica — notas", () => {
  it("muestra el heading Notas y el texto cuando notes está presente", async () => {
    mockOverviewValue = overview({
      quiniela: { ...overview().quiniela, notes: "Pago en efectivo." },
    });
    await renderJoin();
    expect(screen.getByText("Notas")).toBeOnTheScreen();
    expect(screen.getByText("Pago en efectivo.")).toBeOnTheScreen();
  });

  it("oculta las notas cuando notes es null", async () => {
    mockOverviewValue = overview();
    await renderJoin();
    expect(screen.queryByText("Notas")).toBeNull();
  });
});

describe("JoinClasica — banner de sorteo en vivo", () => {
  it("presente con assignMode on_reveal + status open", async () => {
    mockOverviewValue = overview({
      quiniela: { ...overview().quiniela, assignMode: "on_reveal", status: "open" },
    });
    await renderJoin();
    expect(
      screen.getByText(/Sorteo en vivo: los equipos se reparten/),
    ).toBeOnTheScreen();
  });

  it("ausente con assignMode on_join (open)", async () => {
    mockOverviewValue = overview();
    await renderJoin();
    expect(screen.queryByText(/Sorteo en vivo/)).toBeNull();
  });

  it("ausente con on_reveal pero status locked", async () => {
    mockOverviewValue = overview({
      quiniela: { ...overview().quiniela, assignMode: "on_reveal", status: "locked" },
    });
    await renderJoin();
    expect(screen.queryByText(/Sorteo en vivo/)).toBeNull();
  });
});

describe("JoinClasica — tabla de jugadores", () => {
  it("renderiza el header con el conteo y los nombres de los jugadores", async () => {
    mockOverviewValue = overview({
      players: [
        {
          participantId: "p1",
          name: "María",
          photoUrl: null,
          aliveCount: 2,
          totalCount: 3,
          status: "alive",
          teams: [],
        },
        {
          participantId: "p2",
          name: "Pedro",
          photoUrl: null,
          aliveCount: 1,
          totalCount: 3,
          status: "alive",
          teams: [],
        },
      ],
      freeSlots: 6,
    });
    await renderJoin();
    expect(screen.getByText("Tabla de jugadores · 2")).toBeOnTheScreen();
    expect(screen.getByText("María")).toBeOnTheScreen();
    expect(screen.getByText("Pedro")).toBeOnTheScreen();
  });
});

describe("JoinClasica — duelos próximos", () => {
  const kickoff = Date.UTC(2026, 5, 20, 18, 0);

  it("renderiza una DuelRow por duelo cuando hay duelos", async () => {
    mockOverviewValue = overview({
      upcomingDuels: [
        {
          homeOwner: "María",
          homeTeam: teamLite("México", "🇲🇽"),
          awayOwner: "Pedro",
          awayTeam: teamLite("Brasil", "🇧🇷"),
          kickoffAt: kickoff,
        },
      ],
    });
    await renderJoin();
    expect(screen.getByText("Próximos duelos entre ustedes")).toBeOnTheScreen();
    expect(screen.getByText("María")).toBeOnTheScreen();
    expect(screen.getByText("Pedro")).toBeOnTheScreen();
  });

  it("oculta el heading de duelos cuando upcomingDuels está vacío", async () => {
    mockOverviewValue = overview();
    await renderJoin();
    expect(screen.queryByText("Próximos duelos entre ustedes")).toBeNull();
  });
});

describe("JoinClasica — CTA tri-estado", () => {
  it("token 'me' guardado → CTA oculto (sin formulario ni card de cerradas)", async () => {
    mockGetToken.mockImplementation(async (_id: string, kind: string) =>
      kind === "me" ? "stored-mt" : null,
    );
    mockOverviewValue = overview(); // open + freeSlots>0
    await renderJoin();
    // La lectura del Keychain ya resolvió: con token "me" no hay CTA.
    expect(mockGetToken).toHaveBeenCalledWith("Q1", "me");
    expect(screen.queryByText("Confirmar inscripción")).toBeNull();
    expect(screen.queryByText(/No quedan lugares/)).toBeNull();
    expect(screen.queryByText(/inscripciones ya están cerradas/)).toBeNull();
  });

  it("sin token + canJoin (open, freeSlots>0) → FormularioUnirse", async () => {
    mockOverviewValue = overview();
    await renderJoin();
    expect(screen.getByText("Confirmar inscripción")).toBeOnTheScreen();
    expect(screen.getByText("Tu nombre")).toBeOnTheScreen();
  });

  it("sin token + open pero sin lugares → card 'No quedan lugares disponibles.'", async () => {
    mockOverviewValue = overview({
      quiniela: { ...overview().quiniela, status: "open" },
      freeSlots: 0,
    });
    await renderJoin();
    expect(screen.getByText("No quedan lugares disponibles.")).toBeOnTheScreen();
    expect(screen.queryByText("Confirmar inscripción")).toBeNull();
  });

  it("sin token + status locked → card 'Las inscripciones ya están cerradas.'", async () => {
    mockOverviewValue = overview({
      quiniela: { ...overview().quiniela, status: "locked" },
    });
    await renderJoin();
    expect(
      screen.getByText("Las inscripciones ya están cerradas."),
    ).toBeOnTheScreen();
    expect(screen.queryByText("Confirmar inscripción")).toBeNull();
  });
});

describe("JoinClasica — link al Mundial", () => {
  it("renderiza un link con accessibilityRole link y el copy de grupos/bracket", async () => {
    mockOverviewValue = overview();
    await renderJoin();
    const link = screen.getByLabelText("Ver grupos y bracket del Mundial");
    expect(link.props.accessibilityRole).toBe("link");
    expect(
      screen.getByText("Ver grupos y bracket del Mundial"),
    ).toBeOnTheScreen();
  });
});

describe("JoinClasica — flujo de unirse", () => {
  it("confirmar → join({joinToken,name}), setToken('me',personalToken) y router.replace", async () => {
    mockJoin.mockResolvedValue({ personalToken: "new-mt" });
    mockOverviewValue = overview(); // canJoin
    await renderJoin();

    // El formulario ya está montado (lectura del Keychain → null).
    expect(screen.getByText("Confirmar inscripción")).toBeOnTheScreen();

    fireEvent.changeText(screen.getByPlaceholderText("Ej. María"), "Lucía");
    fireEvent.press(screen.getByText("Confirmar inscripción"));

    await waitFor(() =>
      expect(mockJoin).toHaveBeenCalledWith({ joinToken: "jt", name: "Lucía" }),
    );
    // setToken('me') y router.replace en el mismo waitFor: así la aserción de
    // navegación no es racy y, sobre todo, atrapa un futuro refactor que invierta
    // el orden (replace antes de persistir el token) — fuera del waitFor pasaría
    // vacuamente porque setToken ya habría resuelto.
    await waitFor(() => {
      expect(mockSetToken).toHaveBeenCalledWith("Q1", "me", "new-mt");
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/q/[id]/me/[token]",
        params: { id: "Q1", token: "new-mt" },
      });
    });
  });
});
