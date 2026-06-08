// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PickSelector } from "./PickSelector";

describe("PickSelector", () => {
  it("marca el pick activo y dispara onPick", () => {
    const onPick = vi.fn();
    render(<PickSelector value="home" onPick={onPick} options={{ home: "MEX", away: "BRA" }} />);
    expect(screen.getByRole("button", { name: "Pronóstico MEX" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Pronóstico Empate" }));
    expect(onPick).toHaveBeenCalledWith("draw");
  });
  it("deshabilita todos los botones cuando disabled", () => {
    render(<PickSelector value={null} onPick={() => {}} disabled options={{ home: "MEX", away: "BRA" }} />);
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
  });
});
