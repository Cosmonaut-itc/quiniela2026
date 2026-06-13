/**
 * Avatar (SEN-25, Tarea B). READ-ONLY (sin subida de foto). Espejo de
 * src/components/Avatar.tsx: con url → <Image source.uri==url>; sin url →
 * fallback con la inicial en mayúscula.
 */
import { render, screen } from "@testing-library/react-native";

import { Avatar } from "@/components/Avatar";

describe("Avatar", () => {
  it("sin url → fallback con inicial en mayúscula", () => {
    render(<Avatar name="maría" />);
    expect(screen.getByText("M")).toBeOnTheScreen();
    expect(screen.queryByTestId("avatar-image")).toBeNull();
  });

  it("con url → <Image source.uri == url>, sin fallback", () => {
    const url = "https://example.com/foto.png";
    render(<Avatar name="Ana" url={url} />);
    const img = screen.getByTestId("avatar-image");
    expect(img).toBeOnTheScreen();
    // expo-image normaliza `source` a un array de fuentes.
    expect(img.props.source).toEqual([{ uri: url }]);
    expect(screen.queryByText("A")).toBeNull();
  });

  it("url null → fallback (no imagen)", () => {
    render(<Avatar name="Ana" url={null} />);
    expect(screen.getByText("A")).toBeOnTheScreen();
    expect(screen.queryByTestId("avatar-image")).toBeNull();
  });

  it("size aplica width/height explícitos al contenedor", () => {
    render(<Avatar name="Ana" size={48} />);
    const root = screen.getByTestId("avatar-root");
    expect(root.props.style).toEqual(
      expect.objectContaining({ width: 48, height: 48 }),
    );
  });
});
