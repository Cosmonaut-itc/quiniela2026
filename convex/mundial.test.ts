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

describe("getTorneo", () => {
  it("en liga devuelve standings con shortName del torneo", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    for (const ext of ["57", "65"]) {
      await t.mutation(internal.matches.upsertTeam, {
        team: { externalId: ext, name: `T${ext}`, code: ext, crest: "" }, tournamentCode: "PL", format: "liga",
      });
    }
    await t.mutation(internal.matches.upsertMatchResult, {
      tournamentCode: "PL",
      match: { externalId: "m1", stage: "league", group: null, matchday: 1,
        homeExternalId: "57", awayExternalId: "65", kickoffAt: 1,
        homeScore: 2, awayScore: 0, status: "finished", winnerExternalId: "57", bracketSlot: null },
    });
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "Premier", prizeText: "x", numParticipants: 0, gameMode: "progol", tournamentCode: "PL",
    });
    const data = await t.query(api.mundial.getTorneo, { quinielaId: q.quinielaId });
    expect(data.kind).toBe("league");
    if (data.kind === "league") {
      expect(data.tournament.shortName).toBe("Premier");
      expect(data.standings[0]).toMatchObject({ points: 3, played: 1, gd: 2, gf: 2 });
      expect(data.standings[0].team.name).toBe("T57");
    }
  });

  it("en eliminatorio devuelve grupos y bracket (forma actual) con el torneo", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    const data = await t.query(api.mundial.getTorneo, { quinielaId: q.quinielaId });
    expect(data.kind).toBe("brackets");
    if (data.kind === "brackets") {
      expect(data.tournament).toMatchObject({ code: "WC", shortName: "Mundial", format: "eliminatorio" });
      expect(data.groups).toHaveLength(12);
      expect(data.bracket.length).toBeGreaterThan(0);
    }
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
