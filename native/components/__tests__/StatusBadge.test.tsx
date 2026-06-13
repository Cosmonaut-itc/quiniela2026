/**
 * StatusBadge (SEN-25, Tarea B). Espejo de src/components/StatusBadge.tsx:
 * cada uno de los 4 estados (pending/champion/out/alive) renderiza su
 * emoji/texto por defecto, y `label` sobreescribe el texto.
 */
import { render, screen } from "@testing-library/react-native";

import { StatusBadge } from "@/components/StatusBadge";

describe("StatusBadge", () => {
  it("pending → ⏳ En espera", () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByText(/⏳/)).toBeOnTheScreen();
    expect(screen.getByText(/En espera/)).toBeOnTheScreen();
  });

  it("champion → 🏆 Campeón", () => {
    render(<StatusBadge status="champion" />);
    expect(screen.getByText(/🏆/)).toBeOnTheScreen();
    expect(screen.getByText(/Campeón/)).toBeOnTheScreen();
  });

  it("out → Fuera", () => {
    render(<StatusBadge status="out" />);
    expect(screen.getByText(/Fuera/)).toBeOnTheScreen();
  });

  it("alive (default) → Vivo con punto verde", () => {
    render(<StatusBadge status="alive" />);
    expect(screen.getByText(/Vivo/)).toBeOnTheScreen();
    // El punto verde ● es un nodo aparte (View con testID).
    expect(screen.getByTestId("status-dot")).toBeOnTheScreen();
  });

  it("label sobreescribe el texto por defecto", () => {
    render(<StatusBadge status="alive" label="Vivo · 3 equipos" />);
    expect(screen.getByText(/Vivo · 3 equipos/)).toBeOnTheScreen();
    expect(screen.queryByText(/^Vivo$/)).toBeNull();
  });

  it("label en pending mantiene el emoji ⏳", () => {
    render(<StatusBadge status="pending" label="Repartiendo" />);
    expect(screen.getByText(/⏳/)).toBeOnTheScreen();
    expect(screen.getByText(/Repartiendo/)).toBeOnTheScreen();
    expect(screen.queryByText(/En espera/)).toBeNull();
  });
});
