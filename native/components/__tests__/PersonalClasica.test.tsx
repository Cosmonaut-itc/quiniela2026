/**
 * PersonalClasica (SEN-25, Tarea F). Port del panel personal clásico (espejo de
 * src/routes/Personal.tsx, rama Clásica). Se asierta COMPORTAMIENTO (className es
 * no-op bajo jest; nunca estilos computados):
 *   - data === undefined → estado de carga (Cargando), NO el header;
 *   - status "pending" → "El sorteo aún no empieza"; sin "Mis equipos" ni playingNow;
 *   - status "alive" con playingNow live+scheduled → "Jugando ahora / pronto",
 *     "En vivo" para el live, label de kickoff para el scheduled, y "Mis equipos"
 *     con el sufijo aliveCount/totalCount;
 *   - teams.length === 0 (no pending) → EmptyTile "Aún no tienes equipos asignados.";
 *   - header muestra me.name, quinielaName, el label del StatusBadge y el título del
 *     PrizeBanner cuando prizeBanner(...) es truthy.
 *
 * useQuery se mockea despachando por NOMBRE de query: el generated `api` es un
 * Proxy que crea una referencia NUEVA por cada acceso a propiedad (no se puede
 * comparar por ===), así que se desambigua con getFunctionName (convex/server),
 * que da el nombre estable ("quinielas:getMode" / "participants:getPersonalPanel").
 */
import { render, screen } from "@testing-library/react-native";

import type { PersonalData } from "@convex/types";
import { whenLabel } from "@shared/format";

import { PersonalClasica } from "@/components/views/PersonalClasica";

// react-native-safe-area-context: Shell/BottomNav leen useSafeAreaInsets. El mock
// oficial devuelve insets en 0 (irrelevante para aserciones de comportamiento).
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require es la única forma de cargar el mock oficial del paquete aquí.
  require("react-native-safe-area-context/jest/mock").default,
);

// expo-router: BottomNav (dentro del Shell) y el link Mundial usan router.push;
// se mockea para no montar el router real.
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

// @/lib/storage: BottomNav persiste/lee tokens; por defecto getToken resuelve null.
jest.mock("@/lib/storage", () => ({
  getToken: jest.fn(async () => null),
  setToken: jest.fn(async () => undefined),
}));

// convex/react useQuery: despacha por NOMBRE de query (ver cabecera). Cada test
// arma mockModeValue / mockPanelValue antes de render.
let mockModeValue: unknown;
let mockPanelValue: unknown;
jest.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require carga el helper dentro del factory.
    const { getFunctionName } = require("convex/server");
    const name = getFunctionName(ref);
    if (name === "quinielas:getMode") return mockModeValue;
    if (name === "participants:getPersonalPanel") return mockPanelValue;
    return undefined;
  },
}));

const mode = {
  gameMode: "clasica" as const,
  tournament: { code: "wc26", shortName: "Mundial 26", format: "eliminatorio" as const },
};

function panel(over: Partial<PersonalData> = {}): PersonalData {
  return {
    quinielaId: "Q1",
    quinielaName: "La Quiniela del Barrio",
    prize: { mode: "fixed", text: "Una lana", entryFee: null, pool: null, contributors: 0 },
    status: "open",
    joinToken: "jt",
    me: { name: "María", photoUrl: null, status: "alive", aliveCount: 2, totalCount: 3 },
    playingNow: [],
    teams: [],
    ...over,
  };
}

const teamLite = (name: string, flag = "🏳️") => ({
  code: name.slice(0, 3).toUpperCase(),
  name,
  flag,
  group: "A",
});

beforeEach(() => {
  mockModeValue = mode;
  mockPanelValue = undefined;
});

describe("PersonalClasica — carga", () => {
  it("data === undefined → muestra Cargando, no el header", () => {
    mockPanelValue = undefined;
    render(<PersonalClasica quinielaId="Q1" personalToken="mt" />);
    expect(screen.getByText("Cargando…")).toBeOnTheScreen();
    expect(screen.queryByText("La Quiniela del Barrio")).toBeNull();
  });
});

describe("PersonalClasica — status pending", () => {
  it("muestra el sorteo aún no empieza y oculta Mis equipos / playingNow", () => {
    mockPanelValue = panel({
      me: { name: "María", photoUrl: null, status: "pending", aliveCount: 0, totalCount: 0 },
    });
    render(<PersonalClasica quinielaId="Q1" personalToken="mt" />);
    expect(screen.getByText("El sorteo aún no empieza")).toBeOnTheScreen();
    expect(screen.queryByText("Mis equipos")).toBeNull();
    expect(screen.queryByText("Jugando ahora / pronto")).toBeNull();
  });
});

describe("PersonalClasica — status alive con playingNow", () => {
  const kickoff = Date.UTC(2026, 5, 20, 18, 0);

  function renderAlive() {
    mockPanelValue = panel({
      me: { name: "María", photoUrl: null, status: "alive", aliveCount: 2, totalCount: 3 },
      playingNow: [
        {
          myTeam: teamLite("México", "🇲🇽"),
          opponent: teamLite("Brasil", "🇧🇷"),
          opponentOwner: "Pedro",
          kickoffAt: kickoff,
          status: "live",
        },
        {
          myTeam: teamLite("Argentina", "🇦🇷"),
          opponent: teamLite("Francia", "🇫🇷"),
          opponentOwner: "Ana",
          kickoffAt: kickoff,
          status: "scheduled",
        },
      ],
      teams: [
        {
          team: teamLite("México", "🇲🇽"),
          alive: true,
          group: "A",
          nextMatch: null,
          lastResult: null,
        },
      ],
    });
    render(<PersonalClasica quinielaId="Q1" personalToken="mt" />);
  }

  it("muestra el heading de jugando ahora", () => {
    renderAlive();
    expect(screen.getByText("Jugando ahora / pronto")).toBeOnTheScreen();
  });

  it("muestra En vivo para el live y el label de kickoff para el scheduled", () => {
    renderAlive();
    expect(screen.getByText("En vivo")).toBeOnTheScreen();
    expect(screen.getByText(whenLabel(kickoff))).toBeOnTheScreen();
  });

  it("muestra Mis equipos con el sufijo aliveCount/totalCount", () => {
    renderAlive();
    // El heading "Mis equipos" lleva el conteo como <Text> anidado, así que el
    // contenido del nodo externo es "Mis equipos 2/3 vivos": se matchea por
    // substring. El sufijo es su propio <Text> con contenido exacto "2/3 vivos".
    expect(screen.getByText(/Mis equipos/)).toBeOnTheScreen();
    expect(screen.getByText("2/3 vivos")).toBeOnTheScreen();
  });
});

describe("PersonalClasica — sin equipos", () => {
  it("teams vacío y no pending → EmptyTile de equipos sin asignar", () => {
    mockPanelValue = panel({
      me: { name: "María", photoUrl: null, status: "alive", aliveCount: 0, totalCount: 0 },
      teams: [],
    });
    render(<PersonalClasica quinielaId="Q1" personalToken="mt" />);
    expect(screen.getByText("Aún no tienes equipos asignados.")).toBeOnTheScreen();
  });
});

describe("PersonalClasica — header", () => {
  it("muestra nombre, quinielaName, label del badge y título del PrizeBanner", () => {
    mockPanelValue = panel({
      quinielaName: "La Quiniela del Barrio",
      prize: { mode: "fixed", text: "Una botella", entryFee: null, pool: null, contributors: 0 },
      status: "finished",
      me: { name: "María", photoUrl: null, status: "champion", aliveCount: 1, totalCount: 3 },
    });
    render(<PersonalClasica quinielaId="Q1" personalToken="mt" />);
    expect(screen.getByText("María")).toBeOnTheScreen();
    expect(screen.getByText("La Quiniela del Barrio")).toBeOnTheScreen();
    // StatusBadge champion usa el label "Campeón" (statusLabel).
    expect(screen.getByText("🏆 Campeón")).toBeOnTheScreen();
    // prizeBanner(fixed "Una botella", finished, " — para el dueño del campeón")
    // → title "Una botella — para el dueño del campeón".
    expect(
      screen.getByText("Una botella — para el dueño del campeón"),
    ).toBeOnTheScreen();
  });
});
