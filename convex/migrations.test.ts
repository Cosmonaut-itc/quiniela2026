// convex/migrations.test.ts
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

describe("backfillTournamentCode", () => {
  it("marca WC en filas legacy y respeta filas ya marcadas", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("teams", {
        code: "MEX", name: "México", flag: "🇲🇽", group: "A",
        alive: true, currentStage: "group", externalId: "t1",
      });
      await ctx.db.insert("teams", {
        code: "RMA", name: "Real Madrid", flag: "https://crest", group: "",
        alive: true, currentStage: "league", externalId: "t2", tournamentCode: "PD",
      });
      await ctx.db.insert("matches", {
        stage: "group", kickoffAt: 1, status: "scheduled", externalId: "m1",
      });
      await ctx.db.insert("quinielas", {
        name: "Legacy", prizeText: "", numParticipants: 4, slotSizes: [12, 12, 12, 12],
        adminToken: "a", joinToken: "j", status: "open", createdAt: 1,
      });
    });

    const first = await t.mutation(internal.migrations.backfillTournamentCode, {});
    expect(first).toEqual({ patched: 3 });
    const second = await t.mutation(internal.migrations.backfillTournamentCode, {});
    expect(second).toEqual({ patched: 0 });

    await t.run(async (ctx) => {
      const teams = await ctx.db.query("teams").collect();
      expect(teams.find((x) => x.externalId === "t1")?.tournamentCode).toBe("WC");
      expect(teams.find((x) => x.externalId === "t2")?.tournamentCode).toBe("PD");
      const [match] = await ctx.db.query("matches").collect();
      expect(match.tournamentCode).toBe("WC");
      const [qn] = await ctx.db.query("quinielas").collect();
      expect(qn.tournamentCode).toBe("WC");
    });
  });
});
