// convex/seed.ts
import { internalMutation } from "./_generated/server";
import snapshot from "./data/wc2026-snapshot.json";

export const seedFromSnapshot = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("teams").first();
    if (existing) return { teams: 0, matches: 0 };

    const idByExternal = new Map<string, any>();
    for (const tm of snapshot.teams) {
      const id = await ctx.db.insert("teams", {
        code: tm.code, name: tm.name, flag: tm.flag, group: tm.group,
        alive: true, currentStage: "group", externalId: tm.externalId,
      });
      idByExternal.set(tm.externalId, id);
    }
    for (const mt of snapshot.matches) {
      await ctx.db.insert("matches", {
        stage: mt.stage,
        group: mt.group ?? undefined,
        homeTeamId: mt.homeExternalId ? idByExternal.get(mt.homeExternalId) : undefined,
        awayTeamId: mt.awayExternalId ? idByExternal.get(mt.awayExternalId) : undefined,
        kickoffAt: mt.kickoffAt,
        homeScore: mt.homeScore ?? undefined,
        awayScore: mt.awayScore ?? undefined,
        status: mt.status,
        externalId: mt.externalId,
        manualOverride: false,
        bracketSlot: mt.bracketSlot ?? undefined,
      });
    }
    return { teams: snapshot.teams.length, matches: snapshot.matches.length };
  },
});
