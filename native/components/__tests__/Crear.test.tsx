import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import Crear from "@/app/crear";

// react-native-safe-area-context: Pantalla lee useSafeAreaInsets. El mock oficial
// devuelve insets en 0 (irrelevante para aserciones de comportamiento).
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require es la única forma de cargar el mock oficial del paquete aquí.
  require("react-native-safe-area-context/jest/mock").default,
);

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), back: jest.fn() } }));

const mockSetToken = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock("@/lib/storage", () => ({ setToken: (...a: unknown[]) => mockSetToken(...a) }));

// usePhotoUpload: en estos tests no se elige foto.
jest.mock("@/lib/usePhotoUpload", () => ({
  usePhotoUpload: () => ({ pickAndUpload: jest.fn(async () => null), busy: false }),
}));

const mockCreate = jest.fn(async () => ({ quinielaId: "Q9", adminToken: "at9", joinToken: "jt9" }));
const mockPrepare = jest.fn(async () => ({ teamCount: 48 }));
let mockTournaments: unknown;
jest.mock("convex/react", () => ({
  useQuery: (ref: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getFunctionName } = require("convex/server");
    return getFunctionName(ref) === "tournaments:list" ? mockTournaments : undefined;
  },
  useMutation: () => mockCreate,
  useAction: () => mockPrepare,
}));

const WC = { code: "WC", name: "Mundial 2026", shortName: "Mundial", format: "eliminatorio", allowedModes: ["clasica", "progol"], teamCount: 48 };
const LIGA = { code: "ligamx", name: "Liga MX", shortName: "Liga MX", format: "liga", allowedModes: ["progol"], teamCount: 18 };

beforeEach(() => {
  mockCreate.mockClear();
  mockPrepare.mockClear();
  mockSetToken.mockClear();
  (router.replace as jest.Mock).mockClear();
  mockTournaments = [WC, LIGA];
});

describe("Crear", () => {
  it("crea una quiniela clásica y navega al panel admin persistiendo el token", async () => {
    render(<Crear />);
    fireEvent.changeText(screen.getByLabelText("Nombre de la quiniela"), "Oficina");
    fireEvent.press(screen.getByLabelText("Crear quiniela"));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Oficina", gameMode: "clasica", tournamentCode: "WC" }),
    );
    expect(mockSetToken).toHaveBeenCalledWith("Q9", "admin", "at9");
    expect(router.replace).toHaveBeenCalledWith({
      pathname: "/q/[id]/admin/[token]",
      params: { id: "Q9", token: "at9" },
    });
  });

  it("un torneo solo-progol fuerza el modo progol", async () => {
    render(<Crear />);
    fireEvent.changeText(screen.getByLabelText("Nombre de la quiniela"), "Liga");
    fireEvent.press(screen.getByLabelText("Torneo Liga MX")); // allowedModes: ["progol"]
    fireEvent.press(screen.getByLabelText("Crear quiniela"));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ gameMode: "progol", tournamentCode: "ligamx" }),
    );
  });
});
