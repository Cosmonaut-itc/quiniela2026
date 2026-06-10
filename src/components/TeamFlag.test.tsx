// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamFlag } from "./TeamCard";

describe("TeamFlag — banderas emoji vs escudos URL", () => {
  it("renderiza un <img> con el escudo cuando flag es URL", () => {
    render(<TeamFlag flag="https://crests.football-data.org/57.png" name="Arsenal FC" />);
    const img = screen.getByRole("img", { name: "Arsenal FC" });
    expect(img.getAttribute("src")).toBe("https://crests.football-data.org/57.png");
  });

  it("renderiza la bandera emoji como texto", () => {
    render(<TeamFlag flag="🇲🇽" name="México" className="text-lg" />);
    const span = screen.getByText("🇲🇽");
    expect(span.className).toContain("text-lg");
    expect(screen.queryByRole("img")).toBeNull();
  });
});
