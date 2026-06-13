/**
 * bits (SEN-25, Tarea B). Espejo de src/components/bits.tsx:
 * SectionHeading, PrizeBanner (null si no hay título), EmptyTile, ErrorCard.
 */
import { render, screen } from "@testing-library/react-native";

import {
  EmptyTile,
  ErrorCard,
  PrizeBanner,
  SectionHeading,
} from "@/components/bits";

describe("SectionHeading", () => {
  it("renderiza su texto", () => {
    render(<SectionHeading>Mis equipos</SectionHeading>);
    expect(screen.getByText("Mis equipos")).toBeOnTheScreen();
  });
});

describe("PrizeBanner", () => {
  it("título vacío → no renderiza nada", () => {
    render(<PrizeBanner title="" />);
    expect(screen.queryByText(/🏆/)).toBeNull();
  });

  it("título → 🏆 + título", () => {
    render(<PrizeBanner title="$5,000" />);
    expect(screen.getByText(/🏆/)).toBeOnTheScreen();
    expect(screen.getByText("$5,000")).toBeOnTheScreen();
  });

  it("subline presente → se muestra; ausente → no", () => {
    const { rerender } = render(<PrizeBanner title="$5,000" subline="Bote actual" />);
    expect(screen.getByText("Bote actual")).toBeOnTheScreen();
    rerender(<PrizeBanner title="$5,000" />);
    expect(screen.queryByText("Bote actual")).toBeNull();
  });
});

describe("EmptyTile", () => {
  it("renderiza su contenido", () => {
    render(<EmptyTile>Sin equipos aún</EmptyTile>);
    expect(screen.getByText("Sin equipos aún")).toBeOnTheScreen();
  });
});

describe("ErrorCard", () => {
  it("🚫 + mensaje", () => {
    render(<ErrorCard message="No encontrado" />);
    expect(screen.getByText("🚫")).toBeOnTheScreen();
    expect(screen.getByText("No encontrado")).toBeOnTheScreen();
  });
});
