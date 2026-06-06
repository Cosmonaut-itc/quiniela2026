// convex/lib/distribution.test.ts
import { describe, it, expect } from "vitest";
import { computeSlotSizes, drawN, balancedRedistribute } from "./distribution";

// deterministic RNG (mulberry32)
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("computeSlotSizes", () => {
  it("sums to total and is as even as possible", () => {
    const s = computeSlotSizes(10, 48);
    expect(s).toHaveLength(10);
    expect(s.reduce((a, b) => a + b, 0)).toBe(48);
    expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
    expect(s.filter((x) => x === 5)).toHaveLength(8);
    expect(s.filter((x) => x === 4)).toHaveLength(2);
  });
  it("handles N that divides evenly", () => {
    expect(computeSlotSizes(12, 48).every((x) => x === 4)).toBe(true);
  });
  it("handles N = 1", () => {
    expect(computeSlotSizes(1, 48)).toEqual([48]);
  });
});

describe("drawN", () => {
  it("draws n items and returns the rest, no overlap", () => {
    const pool = [1, 2, 3, 4, 5];
    const { picked, rest } = drawN(pool, 2, rng(1));
    expect(picked).toHaveLength(2);
    expect(rest).toHaveLength(3);
    expect(new Set([...picked, ...rest]).size).toBe(5);
  });
});

describe("balancedRedistribute", () => {
  it("assigns all leftover teams to participants with fewest first", () => {
    const leftovers = ["tA", "tB", "tC"];
    const counts = [{ participantId: "p1", count: 5 }, { participantId: "p2", count: 4 }];
    const result = balancedRedistribute(leftovers, counts, rng(2));
    expect(result).toHaveLength(3);
    expect(new Set(result.map((r) => r.teamId))).toEqual(new Set(leftovers));
    // p2 (fewer) should receive at least as many as p1
    const p2 = result.filter((r) => r.participantId === "p2").length;
    const p1 = result.filter((r) => r.participantId === "p1").length;
    expect(p2).toBeGreaterThanOrEqual(p1);
  });
});
