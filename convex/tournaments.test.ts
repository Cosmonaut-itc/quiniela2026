// convex/tournaments.test.ts
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

describe("tournaments.list", () => {
  it("devuelve el catálogo con teamCount y modos permitidos", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.matches.upsertTeam, {
      team: { externalId: "57", name: "Arsenal", code: "ARS", crest: "" },
      tournamentCode: "PL", format: "liga",
    });
    const list = await t.query(api.tournaments.list, {});
    const pl = list.find((x) => x.code === "PL")!;
    expect(pl).toMatchObject({ format: "liga", teamCount: 1, allowedModes: ["progol"] });
    const wc = list.find((x) => x.code === "WC")!;
    expect(wc.allowedModes).toEqual(["clasica", "progol"]);
  });

  it("cuenta filas legacy sin código como WC", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("teams", {
        code: "MEX", name: "México", flag: "🇲🇽", group: "A",
        alive: true, currentStage: "group", externalId: "t1",
      });
    });
    const list = await t.query(api.tournaments.list, {});
    expect(list.find((x) => x.code === "WC")!.teamCount).toBe(1);
  });
});
