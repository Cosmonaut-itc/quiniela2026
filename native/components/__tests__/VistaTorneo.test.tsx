/**
 * VistaTorneo (SEN-25, Tarea H). Port de la Vista Torneo clásica (espejo de
 * src/routes/Mundial.tsx): vista adaptativa — tabla de posiciones en ligas
 * (kind "league"), grupos + bracket con control segmentado en eliminatorios
 * (kind "brackets"). Se asierta COMPORTAMIENTO (texto/visibilidad y el toggle de
 * pestañas); la className de uniwind es no-op bajo jest.
 *
 * useQuery se mockea despachando por NOMBRE de query (el `api` generado es un
 * Proxy: cada acceso crea una referencia nueva no comparable por ===), con
 * getFunctionName (convex/server). Aquí sólo "mundial:getTorneo".
 */
import { fireEvent, render, screen } from "@testing-library/react-native";

import type { TorneoData } from "@convex/types";

import { VistaTorneo } from "@/components/views/VistaTorneo";

// react-native-safe-area-context: Shell/BottomNav leen useSafeAreaInsets. El mock
// oficial devuelve insets en 0 (irrelevante para aserciones de comportamiento).
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require es la única forma de cargar el mock oficial del paquete aquí.
  require("react-native-safe-area-context/jest/mock").default,
);

// expo-router: BottomNav (dentro del Shell) usa router.push; se mockea para no
// montar el router real.
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

// @/lib/storage: BottomNav lee tokens de fallback; por defecto getToken → null.
jest.mock("@/lib/storage", () => ({
  getToken: jest.fn(async () => null),
  setToken: jest.fn(async () => undefined),
}));

// convex/react useQuery: despacha por NOMBRE de query (ver cabecera). Cada test
// arma mockTorneoValue antes de render.
let mockTorneoValue: unknown;
jest.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require carga el helper dentro del factory.
    const { getFunctionName } = require("convex/server");
    const name = getFunctionName(ref);
    if (name === "mundial:getTorneo") return mockTorneoValue;
    return undefined;
  },
}));

const tournament = (over: Partial<TorneoData["tournament"]> = {}) => ({
  code: "wc26",
  shortName: "Mundial 26",
  format: "eliminatorio" as const,
  ...over,
});

const MEX = { code: "MEX", name: "México", flag: "🇲🇽", group: "A" };
const BRA = { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "A" };

// Fixture de ligas (kind "league"): standings con nombres de equipo.
const leagueData = (): TorneoData => ({
  kind: "league",
  tournament: tournament({ shortName: "Liga MX", format: "liga" }),
  standings: [
    { team: MEX, points: 9, played: 3, gd: 4, gf: 7 },
    { team: BRA, points: 3, played: 3, gd: -2, gf: 2 },
  ],
});

// Fixture de eliminatorios (kind "brackets"). Marcadores distintos por panel:
//   - GroupsView renderiza la etiqueta "Grupo A" (texto sólo del panel grupos);
//   - BracketView renderiza la etiqueta de ronda "Semifinales" (texto sólo del
//     panel bracket). Permiten distinguir qué panel está montado.
const bracketsData = (showOwners = true): TorneoData => ({
  kind: "brackets",
  tournament: tournament({ shortName: "Mundial 26" }),
  showOwners,
  groups: [
    {
      group: "A",
      rows: [
        { team: MEX, points: 9, gd: 4, gf: 7, ownerName: "Ana", ownerPhotoUrl: null, alive: true },
        { team: BRA, points: 6, gd: 1, gf: 4, ownerName: "Beto", ownerPhotoUrl: null, alive: true },
      ],
    },
  ],
  bracket: [
    {
      stage: "semis",
      label: "Semifinales",
      matches: [
        {
          home: { team: MEX, owner: "Ana" },
          away: { team: BRA, owner: "Beto" },
          homeScore: null,
          awayScore: null,
          winnerTeamId: null,
          status: "scheduled",
        },
      ],
    },
  ],
});

beforeEach(() => {
  mockTorneoValue = undefined;
});

describe("VistaTorneo — carga", () => {
  it("getTorneo === undefined → muestra Cargando, no el header", () => {
    mockTorneoValue = undefined;
    render(<VistaTorneo quinielaId="Q1" />);
    expect(screen.getByText("Cargando…")).toBeOnTheScreen();
    expect(screen.queryByText("Mundial 26")).toBeNull();
  });
});

describe("VistaTorneo — kind league", () => {
  it("muestra shortName, el subtítulo de tabla y un equipo del standings; sin pestañas", () => {
    mockTorneoValue = leagueData();
    render(<VistaTorneo quinielaId="Q1" />);
    // shortName aparece exactamente dos veces como Text: header + label del tab
    // Mundial en el BottomNav (getAllByText lanza si encuentra 0, así que la
    // cuenta exacta es la aserción con sustancia, no `> 0`).
    expect(screen.getAllByText("Liga MX")).toHaveLength(2);
    expect(screen.getByText("Tabla de posiciones del torneo.")).toBeOnTheScreen();
    // Contenido de StandingsView.
    expect(screen.getByText("México")).toBeOnTheScreen();
    // El control segmentado Grupos/Bracket NO existe en ligas.
    expect(screen.queryByLabelText("Grupos")).toBeNull();
    expect(screen.queryByLabelText("Bracket")).toBeNull();
  });
});

describe("VistaTorneo — kind brackets", () => {
  it("muestra ambas pestañas; por defecto grupos está activa y su contenido visible, el bracket oculto", () => {
    mockTorneoValue = bracketsData();
    render(<VistaTorneo quinielaId="Q1" />);

    const grupos = screen.getByLabelText("Grupos");
    const bracket = screen.getByLabelText("Bracket");
    expect(grupos).toBeOnTheScreen();
    expect(bracket).toBeOnTheScreen();
    // Pestaña por defecto: grupos seleccionada, bracket no.
    expect(grupos).toBeSelected();
    expect(bracket).not.toBeSelected();
    // Sólo el panel de grupos está montado.
    expect(screen.getByText(/Grupo A/)).toBeOnTheScreen();
    expect(screen.queryByText("Semifinales")).toBeNull();
  });

  it("pulsar Bracket monta el panel bracket y desmonta grupos; volver a Grupos lo revierte", () => {
    mockTorneoValue = bracketsData();
    render(<VistaTorneo quinielaId="Q1" />);

    fireEvent.press(screen.getByLabelText("Bracket"));
    expect(screen.getByLabelText("Bracket")).toBeSelected();
    expect(screen.getByLabelText("Grupos")).not.toBeSelected();
    // Ahora el panel bracket está montado y el de grupos no.
    expect(screen.getByText("Semifinales")).toBeOnTheScreen();
    expect(screen.queryByText(/Grupo A/)).toBeNull();

    fireEvent.press(screen.getByLabelText("Grupos"));
    expect(screen.getByLabelText("Grupos")).toBeSelected();
    expect(screen.getByText(/Grupo A/)).toBeOnTheScreen();
    expect(screen.queryByText("Semifinales")).toBeNull();
  });

  it("showOwners true → subtítulo 'Cada equipo lleva la cara de su dueño.'", () => {
    mockTorneoValue = bracketsData(true);
    render(<VistaTorneo quinielaId="Q1" />);
    expect(
      screen.getByText("Cada equipo lleva la cara de su dueño."),
    ).toBeOnTheScreen();
  });

  it("showOwners false → subtítulo 'Grupos, posiciones y bracket del torneo.'", () => {
    mockTorneoValue = bracketsData(false);
    render(<VistaTorneo quinielaId="Q1" />);
    expect(
      screen.getByText("Grupos, posiciones y bracket del torneo."),
    ).toBeOnTheScreen();
  });
});

describe("VistaTorneo — BottomNav", () => {
  it("renderiza el tab Mundial con el shortName del torneo y seleccionado", () => {
    mockTorneoValue = bracketsData();
    render(<VistaTorneo quinielaId="Q1" />);
    // El tab "mundial" usa tournament.shortName como label y queda activo.
    const tab = screen.getByLabelText("Mundial 26");
    expect(tab).toBeOnTheScreen();
    expect(tab).toBeSelected();
  });
});
