// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GroupsView } from "./GroupsView";

const groups = [{
  group: "A",
  rows: [{ team: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" }, points: 3, gd: 1, gf: 2, ownerName: "Ana", ownerPhotoUrl: null, alive: true }],
}];

describe("GroupsView showOwners", () => {
  it("oculta el nombre del dueño cuando showOwners es false", () => {
    const { rerender } = render(<GroupsView groups={groups} showOwners={false} />);
    expect(screen.queryByText("Ana")).toBeNull();
    rerender(<GroupsView groups={groups} showOwners />);
    expect(screen.getByText("Ana")).toBeDefined();
  });
});
