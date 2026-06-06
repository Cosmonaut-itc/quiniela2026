// convex/lib/view.test.ts
import { describe, it, expect } from "vitest";
import { prizeModeOf, prizeView } from "./view";

describe("prizeModeOf", () => {
  it("treats a missing mode as fixed (legacy)", () => {
    expect(prizeModeOf({})).toBe("fixed");
    expect(prizeModeOf({ prizeMode: "fixed" })).toBe("fixed");
    expect(prizeModeOf({ prizeMode: "weird" })).toBe("fixed");
  });
  it("recognises per_person", () => {
    expect(prizeModeOf({ prizeMode: "per_person" })).toBe("per_person");
  });
});

describe("prizeView", () => {
  it("returns the fixed text and a null pool for fixed mode", () => {
    const p = prizeView({ prizeText: "$5,000" }, 3);
    expect(p).toEqual({
      mode: "fixed", text: "$5,000", entryFee: null, pool: null, contributors: 3,
    });
  });
  it("computes pool = entryFee * contributors for per_person", () => {
    const p = prizeView({ prizeText: "", prizeMode: "per_person", entryFee: 200 }, 7);
    expect(p).toEqual({
      mode: "per_person", text: "", entryFee: 200, pool: 1400, contributors: 7,
    });
  });
  it("per_person with zero contributors yields a zero pool", () => {
    const p = prizeView({ prizeText: "", prizeMode: "per_person", entryFee: 200 }, 0);
    expect(p.pool).toBe(0);
  });
});
