// convex/quinielas.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

async function seeded() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  await t.mutation(internal.seed.seedFromSnapshot, {});
  return t;
}

describe("createQuiniela", () => {
  it("creates a quiniela with tokens and precomputed slot sizes", async () => {
    const t = await seeded();
    const res = await t.mutation(api.quinielas.createQuiniela, {
      name: "Familia", prizeText: "$5,000", numParticipants: 10,
    });
    expect(res.quinielaId).toBeDefined();
    expect(res.adminToken).toHaveLength(64);
    expect(res.joinToken).toHaveLength(64);
    const qn = await t.run((ctx) => ctx.db.get(res.quinielaId as any));
    expect(qn!.slotSizes.reduce((a: number, b: number) => a + b, 0)).toBe(48);
    expect(qn!.status).toBe("open");
  });
});
