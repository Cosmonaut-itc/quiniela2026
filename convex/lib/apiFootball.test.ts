import { describe, it, expect } from "vitest";
import { normalizeTeamName } from "./apiFootball";

describe("normalizeTeamName", () => {
  it("baja a minúsculas, quita acentos, puntuación y sufijos de club", () => {
    expect(normalizeTeamName("Atlético Madrid")).toBe("atletico madrid");
    expect(normalizeTeamName("Manchester City FC")).toBe("manchester city");
    expect(normalizeTeamName("A.F.C. Bournemouth")).toBe("bournemouth");
  });
  it("aplica alias curados", () => {
    expect(normalizeTeamName("Man City")).toBe("manchester city");
  });
});
