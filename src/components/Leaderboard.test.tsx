// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Leaderboard } from "./Leaderboard";

const rows = [
  { participantId: "A", name: "Ana", photoUrl: null, points: 3, correct: 3, played: 5, rank: 1 },
  { participantId: "B", name: "Beto", photoUrl: null, points: 1, correct: 1, played: 5, rank: 2 },
];

describe("Leaderboard", () => {
  it("muestra puntos y dispara onSelect al tocar una fila", () => {
    const onSelect = vi.fn();
    render(<Leaderboard rows={rows} onSelect={onSelect} />);
    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    fireEvent.click(screen.getByText("Beto"));
    expect(onSelect).toHaveBeenCalledWith("B");
  });
});
