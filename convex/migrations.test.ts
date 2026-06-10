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

describe("cleanupForeignOwnerships", () => {
  it("borra ownerships de otro torneo y conserva las del torneo (incl. legacy)", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const quinielaId = await ctx.db.insert("quinielas", {
        name: "Mundialera", prizeText: "", numParticipants: 4, slotSizes: [12, 12, 12, 12],
        adminToken: "a", joinToken: "j", status: "locked", createdAt: 1,
        tournamentCode: "WC",
      });
      const participantId = await ctx.db.insert("participants", {
        quinielaId, name: "Ana", personalToken: "p1", slotIndex: 0, joinedAt: 1,
      });
      const wcTeamId = await ctx.db.insert("teams", {
        code: "MEX", name: "México", flag: "🇲🇽", group: "A",
        alive: true, currentStage: "group", externalId: "wc1", tournamentCode: "WC",
      });
      const plTeamId = await ctx.db.insert("teams", {
        code: "ARS", name: "Arsenal", flag: "https://crest", group: "",
        alive: true, currentStage: "league", externalId: "pl1", tournamentCode: "PL",
      });
      // Equipo legacy sin tournamentCode: normaliza a WC, NO debe borrarse.
      const legacyTeamId = await ctx.db.insert("teams", {
        code: "BRA", name: "Brasil", flag: "🇧🇷", group: "B",
        alive: true, currentStage: "group", externalId: "wc2",
      });
      await ctx.db.insert("ownerships", { quinielaId, teamId: wcTeamId, participantId });
      await ctx.db.insert("ownerships", { quinielaId, teamId: plTeamId, participantId });
      await ctx.db.insert("ownerships", { quinielaId, teamId: legacyTeamId, participantId });
      return { wcTeamId, plTeamId, legacyTeamId };
    });

    const first = await t.mutation(internal.migrations.cleanupForeignOwnerships, {});
    expect(first).toEqual({ deleted: 1 });

    await t.run(async (ctx) => {
      const teamIds = (await ctx.db.query("ownerships").collect()).map((o) => o.teamId);
      expect(teamIds).toHaveLength(2);
      expect(teamIds).toContain(ids.wcTeamId);
      expect(teamIds).toContain(ids.legacyTeamId);
      expect(teamIds).not.toContain(ids.plTeamId);
    });

    const second = await t.mutation(internal.migrations.cleanupForeignOwnerships, {});
    expect(second).toEqual({ deleted: 0 });
  });
});
