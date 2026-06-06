// convex/matches.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

// convex-test cannot auto-discover function modules under Vite; pass the
// module map explicitly (the documented edge-runtime pattern).
const modules = import.meta.glob("./**/*.*s");

describe("seed + recompute", () => {
  it("seeds 48 teams and 104 matches with group teams populated", async () => {
    const t = convexTest(schema, modules);
    const res = await t.mutation(internal.seed.seedFromSnapshot, {});
    expect(res.teams).toBe(48);
    expect(res.matches).toBe(104);
    const teams = await t.run((ctx) => ctx.db.query("teams").collect());
    expect(teams.every((x) => x.alive)).toBe(true);
  });

  it("upsertMatchResult records a score and recompute flips a knockout loser", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    // pick any group match, finish it
    const gm = await t.run((ctx) =>
      ctx.db.query("matches").withIndex("by_stage_kickoff", (q) => q.eq("stage", "group")).first());
    await t.mutation(internal.matches.upsertMatchResult, {
      match: { externalId: gm!.externalId, stage: "group", group: gm!.group ?? null,
        homeExternalId: null, awayExternalId: null, kickoffAt: gm!.kickoffAt,
        homeScore: 2, awayScore: 0, status: "finished", bracketSlot: null },
    });
    const updated = await t.run((ctx) =>
      ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", gm!.externalId)).first());
    expect(updated!.homeScore).toBe(2);
    expect(updated!.status).toBe("finished");
  });
});
