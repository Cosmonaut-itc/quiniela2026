// convex/participants.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

async function setup(n: number) {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  await t.mutation(internal.seed.seedFromSnapshot, {});
  const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: n });
  return { t, q };
}

describe("joinQuiniela", () => {
  it("assigns a slot-sized batch of unique teams on join", async () => {
    const { t, q } = await setup(10);
    const res = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    expect(res.personalToken).toHaveLength(64);
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(owns.length).toBeGreaterThanOrEqual(4);
    expect(owns.length).toBeLessThanOrEqual(5);
    expect(new Set(owns.map((o) => o.teamId)).size).toBe(owns.length); // unique
  });

  it("never assigns the same team to two participants", async () => {
    const { t, q } = await setup(2); // 24 + 24
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "A" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "B" });
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(new Set(owns.map((o) => o.teamId)).size).toBe(owns.length);
  });

  it("rejects joining when all slots are full", async () => {
    const { t, q } = await setup(1);
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "A" });
    await expect(
      t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "B" }),
    ).rejects.toThrow();
  });

  it("does not assign teams on join when assignMode is on_reveal", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "F", prizeText: "$1", numParticipants: 2, assignMode: "on_reveal",
    });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(owns.length).toBe(0); // teams wait for the admin's manual reveal
  });
});

describe("getPersonalPanel", () => {
  it("returns my teams with next opponent and owner", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Beto" });
    const panel = await t.query(api.participants.getPersonalPanel, { personalToken: a.personalToken });
    expect(panel.me.name).toBe("Ana");
    expect(panel.teams.length).toBeGreaterThan(0);
    expect(panel.me.status).toBe("alive");
  });

  it("reports pending status before the reveal in on_reveal mode", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "F", prizeText: "$1", numParticipants: 2, assignMode: "on_reveal",
    });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const panel = await t.query(api.participants.getPersonalPanel, { personalToken: a.personalToken });
    expect(panel.me.status).toBe("pending");
    expect(panel.teams.length).toBe(0);
  });
});
