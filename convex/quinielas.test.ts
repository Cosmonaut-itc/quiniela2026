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
    const qn = await t.run((ctx) => ctx.db.get(res.quinielaId));
    expect(qn!.slotSizes.reduce((a: number, b: number) => a + b, 0)).toBe(48);
    expect(qn!.status).toBe("open");
  });
});

describe("closeAndRedistribute", () => {
  it("assigns all 48 teams when some slots were never filled", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 10 });
    // only 3 of 10 join
    for (const name of ["A", "B", "C"]) {
      await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name });
    }
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(owns.length).toBe(48); // every team owned
    expect(new Set(owns.map((o) => o.teamId)).size).toBe(48);
    const qn = await t.run((ctx) => ctx.db.get(q.quinielaId));
    expect(qn!.status).toBe("locked");
  });
});

describe("getOverview", () => {
  it("ranks players by alive then alive-count and reports free slots", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    expect(ov.quiniela.name).toBe("F");
    expect(ov.players).toHaveLength(1);
    expect(ov.players[0].status).toBe("alive");
    expect(ov.freeSlots).toBe(3);
  });
});

describe("getAdmin", () => {
  it("returns participants with team counts and the match list", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const admin = await t.query(api.quinielas.getAdmin, { adminToken: q.adminToken });
    expect(admin.participants).toHaveLength(1);
    expect(admin.participants[0].teamCount).toBeGreaterThan(0);
    expect(admin.matches.length).toBe(104);
    expect(admin.quiniela.joinToken).toBe(q.joinToken);
  });
});
