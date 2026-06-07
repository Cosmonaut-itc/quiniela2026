// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { BottomNav } from "./Shell";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname}</div>;
}

function renderNav() {
  return render(
    <MemoryRouter initialEntries={["/q/Q1/mundial"]}>
      <BottomNav id="Q1" active="general" joinToken="jt" />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BottomNav — recuperar Mi panel sin token guardado", () => {
  beforeEach(() => localStorage.clear());

  it("Mi panel es un botón (no un tab deshabilitado) cuando no hay token", () => {
    renderNav();
    expect(screen.getByRole("button", { name: /Mi panel/i })).toBeDefined();
  });

  it("pegar el link personal navega a Mi panel", async () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /Mi panel/i }));

    const input = await screen.findByPlaceholderText(/\/me\//);
    fireEvent.change(input, {
      target: { value: "https://quiniela.app/q/Q1/me/tok9" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Abrir mi panel/i }));

    expect(screen.getByTestId("loc").textContent).toBe("/q/Q1/me/tok9");
  });

  it("un token suelto usa la quiniela actual", async () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /Mi panel/i }));
    const input = await screen.findByPlaceholderText(/\/me\//);
    fireEvent.change(input, { target: { value: "soloToken" } });
    fireEvent.click(screen.getByRole("button", { name: /Abrir mi panel/i }));
    expect(screen.getByTestId("loc").textContent).toBe("/q/Q1/me/soloToken");
  });
});
