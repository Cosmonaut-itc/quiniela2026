// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

describe("schema lineups", () => {
  it("guarda y lee una fila de lineup", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => {
      const matchId = await ctx.db.insert("matches", {
        stage: "group", kickoffAt: 0, status: "live", externalId: "m1", tournamentCode: "WC",
      });
      return ctx.db.insert("lineups", {
        matchId, tournamentCode: "WC", apiFixtureId: 7, fetchedAt: 0, confirmed: true,
        home: { name: "A", formation: "4-3-3", coach: "X", startXI: [{ name: "p", number: 1, pos: "G" }], bench: [] },
        away: { name: "B", formation: "4-4-2", coach: "Y", startXI: [], bench: [] },
      });
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.home.startXI[0].name).toBe("p");
    expect(row?.confirmed).toBe(true);
  });
});
