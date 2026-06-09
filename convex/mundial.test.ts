// convex/mundial.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

describe("getMundial", () => {
  it("returns 12 groups with owner-tagged rows and a bracket", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Beto" });
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    const data = await t.query(api.mundial.getMundial, { quinielaId: q.quinielaId });
    expect(data.groups).toHaveLength(12);
    expect(data.groups[0].rows).toHaveLength(4);
    expect(data.groups[0].rows[0].ownerName).not.toBe("");
    expect(data.bracket.length).toBeGreaterThan(0);
  });
});

describe("getMundial showOwners", () => {
  it("showOwners=false en progol y true en clásica", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const c = await t.mutation(api.quinielas.createQuiniela, { name: "C", prizeText: "$1", numParticipants: 2 });
    const p = await t.mutation(api.quinielas.createQuiniela, { name: "P", prizeText: "$1", numParticipants: 2, gameMode: "progol" });
    expect((await t.query(api.mundial.getMundial, { quinielaId: c.quinielaId })).showOwners).toBe(true);
    expect((await t.query(api.mundial.getMundial, { quinielaId: p.quinielaId })).showOwners).toBe(false);
  });
});
