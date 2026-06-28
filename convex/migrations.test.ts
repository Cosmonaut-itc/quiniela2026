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

describe("cleanupWrongEliminationNotifications", () => {
  it("borra avisos de eliminación de clasificados y disqualified afectados; conserva los legítimos", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const mk = (code: string, ext: string) =>
        ctx.db.insert("teams", {
          code, name: code, flag: "🏳️", group: "A", alive: false,
          currentStage: "out", externalId: ext, tournamentCode: "WC",
        });
      // Grupo A: a1 > a2 > a3 (clasifican) > a4 (eliminado real)
      const a1 = await mk("A1", "a1"); const a2 = await mk("A2", "a2");
      const a3 = await mk("A3", "a3"); const a4 = await mk("A4", "a4");
      const fin = (h: string, a: string) =>
        ctx.db.insert("matches", {
          stage: "group", group: "A", homeTeamId: h as never, awayTeamId: a as never,
          homeScore: 1, awayScore: 0, status: "finished", winnerTeamId: h as never,
          kickoffAt: 1, externalId: `${h}-${a}`, tournamentCode: "WC",
        });
      await fin(a1, a2); await fin(a1, a3); await fin(a1, a4);
      await fin(a2, a3); await fin(a2, a4); await fin(a3, a4);

      const quinielaId = await ctx.db.insert("quinielas", {
        name: "Q", prizeText: "", numParticipants: 2, slotSizes: [2, 2],
        adminToken: "a", joinToken: "j", status: "locked", createdAt: 1, tournamentCode: "WC",
      });
      const p1 = await ctx.db.insert("participants", {
        quinielaId, name: "P1", personalToken: "p1", slotIndex: 0, joinedAt: 1,
      });
      const p2 = await ctx.db.insert("participants", {
        quinielaId, name: "P2", personalToken: "p2", slotIndex: 1, joinedAt: 1,
      });
      await ctx.db.insert("ownerships", { quinielaId, teamId: a1, participantId: p1 });
      await ctx.db.insert("ownerships", { quinielaId, teamId: a4, participantId: p2 });

      const notif = (type: string, extra: Record<string, unknown>, key: string) =>
        ctx.db.insert("notifications", {
          quinielaId, audience: "participant", type, title: "t", body: "b",
          createdAt: 1, dedupeKey: key, ...extra,
        });
      // erróneo (clasificado) vs legítimo (eliminado real)
      await notif("team_eliminated", { participantId: p1, teamId: a1 }, "k1");
      await notif("team_eliminated", { participantId: p2, teamId: a4 }, "k2");
      // disqualified de P1 (tiene clasificado → erróneo) vs P2 (solo eliminado → legítimo)
      await notif("disqualified", { participantId: p1 }, "k3");
      await notif("disqualified", { participantId: p2 }, "k4");
      return { a1, a4, p1, p2 };
    });

    const first = await t.mutation(internal.migrations.cleanupWrongEliminationNotifications, {});
    expect(first).toEqual({ teamEliminated: 1, disqualified: 1 });

    await t.run(async (ctx) => {
      const ns = await ctx.db.query("notifications").collect();
      const keys = ns.map((n) => n.dedupeKey).sort();
      expect(keys).toEqual(["k2", "k4"]); // se quedan el del eliminado real y su disqualified
    });

    const second = await t.mutation(internal.migrations.cleanupWrongEliminationNotifications, {});
    expect(second).toEqual({ teamEliminated: 0, disqualified: 0 });
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
