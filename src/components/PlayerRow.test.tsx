// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PlayerRow } from "./PlayerRow";

describe("PlayerRow", () => {
  it("shows alive count and name", () => {
    render(<PlayerRow p={{ participantId: "1", name: "Ana", photoUrl: null, aliveCount: 3, totalCount: 5, status: "alive" }} />);
    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });
});
