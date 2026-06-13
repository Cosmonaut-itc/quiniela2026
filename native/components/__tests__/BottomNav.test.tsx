/**
 * BottomNav (SEN-25, Tarea E). Espejo de src/components/Shell.tsx (BottomNav).
 * Tres tabs (Mi panel · General · Mundial). Se asierta COMPORTAMIENTO:
 *   - los tres tabs renderizan con su label; Mundial usa tournament.shortName;
 *   - el tab activo está marcado `selected` y NO navega;
 *   - General sin joinToken → deshabilitado (no pulsable, accessibilityState.disabled);
 *   - Mi panel sin meToken → botón actionable que navega al home (router.push("/"));
 *   - Mi panel / General CON sus tokens → navegan a su ruta /q/[id]/{me,join}/[token];
 *   - fallback async: sin meToken en props pero CON token guardado, el tab navega
 *     a la ruta personal una vez que getToken resuelve.
 * No se asiertan estilos computados (className es no-op bajo jest); la navegación
 * se asierta vía el mock de router.push (igual patrón typed que app/index.tsx).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { BottomNav } from "@/components/Shell";

// react-native-safe-area-context: BottomNav lee useSafeAreaInsets para el padding
// inferior. Sin SafeAreaProvider en el árbol de test, el mock oficial del paquete
// devuelve insets en 0 (irrelevante para las aserciones de comportamiento).
jest.mock("react-native-safe-area-context", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- el factory de jest.mock se evalúa hoisted; require es la única forma de cargar el mock oficial del paquete aquí.
  require("react-native-safe-area-context/jest/mock").default,
);

// expo-router: router.push se mockea para asertar los targets de navegación sin
// montar el router real. La firma typed {pathname, params} se preserva.
// (prefijo `mock` exigido por jest para referenciar la var dentro del factory.)
const mockPush = jest.fn<void, [unknown]>();
jest.mock("expo-router", () => ({
  router: { push: (arg: unknown) => mockPush(arg) },
}));

// @/lib/storage: por defecto getToken resuelve null (sin token guardado); cada
// test que necesita un valor lo sobreescribe con mockImplementation.
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

beforeEach(() => {
  mockPush.mockClear();
  mockSetToken.mockClear();
  mockGetToken.mockClear();
  mockGetToken.mockResolvedValue(null);
});

describe("BottomNav — labels", () => {
  it("renderiza los tres tabs con sus labels", () => {
    render(<BottomNav id="Q1" active="me" meToken="mt" joinToken="jt" />);
    expect(screen.getByText("Mi panel")).toBeOnTheScreen();
    expect(screen.getByText("General")).toBeOnTheScreen();
    expect(screen.getByText("Mundial")).toBeOnTheScreen();
  });

  it("Mundial usa tournament.shortName cuando está presente", () => {
    render(
      <BottomNav
        id="Q1"
        active="me"
        meToken="mt"
        joinToken="jt"
        tournament={{ shortName: "Mundial 26" }}
      />,
    );
    expect(screen.getByText("Mundial 26")).toBeOnTheScreen();
    expect(screen.queryByText("Mundial")).toBeNull();
  });
});

describe("BottomNav — tab activo", () => {
  it("el tab activo está marcado selected y no navega al pulsarlo", () => {
    render(<BottomNav id="Q1" active="mundial" meToken="mt" joinToken="jt" />);
    const mundial = screen.getByLabelText("Mundial");
    expect(mundial.props.accessibilityState?.selected).toBe(true);
    // El tab activo es un View sin onPress: sin esta aserción el
    // not.toHaveBeenCalled de abajo sería vacuo (un View nunca dispara push).
    expect(mundial.props.onPress).toBeUndefined();
    fireEvent.press(mundial);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("los tabs inactivos NO están marcados selected", () => {
    render(<BottomNav id="Q1" active="mundial" meToken="mt" joinToken="jt" />);
    expect(screen.getByLabelText("Mi panel").props.accessibilityState?.selected).toBe(
      false,
    );
    expect(screen.getByLabelText("General").props.accessibilityState?.selected).toBe(
      false,
    );
  });
});

describe("BottomNav — General (join)", () => {
  it("sin joinToken → deshabilitado: no navega y accessibilityState.disabled", async () => {
    render(<BottomNav id="Q1" active="me" meToken="mt" />);
    const general = screen.getByLabelText("General");
    expect(general.props.accessibilityState?.disabled).toBe(true);
    // Es un View sin onPress: no pulsable. Sin esto el not.toHaveBeenCalled
    // de abajo sería vacuo (un View nunca dispara push).
    expect(general.props.onPress).toBeUndefined();
    fireEvent.press(general);
    // Esperar a que cualquier fallback async de storage resuelva antes de afirmar.
    await waitFor(() => expect(mockGetToken).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("con joinToken → navega a /q/[id]/join/[token]", () => {
    render(<BottomNav id="Q1" active="me" meToken="mt" joinToken="jt" />);
    fireEvent.press(screen.getByLabelText("General"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/q/[id]/join/[token]",
      params: { id: "Q1", token: "jt" },
    });
  });
});

describe("BottomNav — Mi panel (me)", () => {
  it("sin meToken → botón actionable que navega al home", async () => {
    render(<BottomNav id="Q1" active="general" joinToken="jt" />);
    const mePanel = screen.getByLabelText("Mi panel");
    // Es actionable (no deshabilitado).
    expect(mePanel.props.accessibilityState?.disabled).toBeFalsy();
    fireEvent.press(mePanel);
    // El fallback async de storage no tiene token → al pulsar va al home.
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/"));
  });

  it("con meToken → navega a /q/[id]/me/[token]", () => {
    render(<BottomNav id="Q1" active="general" meToken="mt" joinToken="jt" />);
    fireEvent.press(screen.getByLabelText("Mi panel"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/q/[id]/me/[token]",
      params: { id: "Q1", token: "mt" },
    });
  });
});

describe("BottomNav — persistencia y fallback async", () => {
  it("persiste los tokens provistos al montar (fire-and-forget)", async () => {
    render(<BottomNav id="Q1" active="mundial" meToken="mt" joinToken="jt" />);
    await waitFor(() => {
      expect(mockSetToken).toHaveBeenCalledWith("Q1", "me", "mt");
      expect(mockSetToken).toHaveBeenCalledWith("Q1", "join", "jt");
    });
  });

  it("sin meToken en props pero CON token guardado → Mi panel navega a su ruta", async () => {
    mockGetToken.mockImplementation(async (_id: string, kind: string) =>
      kind === "me" ? "stored-mt" : null,
    );
    render(<BottomNav id="Q1" active="mundial" />);
    // Esperar a que el fallback de storage resuelva y habilite el target.
    await waitFor(() => expect(mockGetToken).toHaveBeenCalledWith("Q1", "me"));
    fireEvent.press(screen.getByLabelText("Mi panel"));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/q/[id]/me/[token]",
        params: { id: "Q1", token: "stored-mt" },
      }),
    );
  });
});
