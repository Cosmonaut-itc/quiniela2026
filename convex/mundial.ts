// convex/mundial.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { teamLite, photoUrl } from "./lib/view";
import { computeGroupStandings } from "./lib/tournament";
import type { MundialData } from "./types";

const BRACKET_STAGES: { stage: string; label: string }[] = [
  { stage: "r32", label: "Dieciseisavos" },
  { stage: "r16", label: "Octavos" },
  { stage: "qf", label: "Cuartos" },
  { stage: "sf", label: "Semifinales" },
  { stage: "third", label: "Tercer lugar" },
  { stage: "final", label: "Final" },
];

export const getMundial = query({
  args: { quinielaId: v.id("quinielas") },
  handler: async (ctx, { quinielaId }): Promise<MundialData> => {
    const teams = await ctx.db.query("teams").collect();
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const matches = await ctx.db.query("matches").collect();
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId)).collect();
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId)).collect();
    const nameById = new Map(participants.map((p) => [p._id, p]));
    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));

    const ownerName = (teamId?: Id<"teams"> | string | null) => {
      const tid = teamId as Id<"teams"> | null | undefined;
      return tid && ownerByTeam.has(tid) ? nameById.get(ownerByTeam.get(tid)!)?.name ?? "—" : "Sin dueño";
    };

    const teamRows = teams.map((t) => ({ _id: t._id as string, group: t.group }));
    const matchRows = matches.map((mt) => ({
      _id: mt._id as string, stage: mt.stage, group: mt.group,
      homeTeamId: mt.homeTeamId ?? null, awayTeamId: mt.awayTeamId ?? null,
      homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
      status: mt.status, winnerTeamId: mt.winnerTeamId ?? null, kickoffAt: mt.kickoffAt,
    }));

    const groupLetters = [...new Set(teams.map((t) => t.group))].sort();
    const groups = await Promise.all(groupLetters.map(async (g) => {
      const standings = computeGroupStandings(g, teamRows, matchRows);
      const rows = await Promise.all(standings.map(async (s) => {
        const teamId = s.teamId as Id<"teams">;
        const tm = teamById.get(teamId)!;
        const ownerId = ownerByTeam.get(teamId);
        return {
          team: teamLite(tm)!, points: s.points, gd: s.gd, gf: s.gf,
          ownerName: ownerName(teamId), alive: tm.alive,
          ownerPhotoUrl: ownerId ? await photoUrl(ctx, nameById.get(ownerId)?.photoId) : null,
        };
      }));
      return { group: g, rows };
    }));

    const bracket = BRACKET_STAGES.map(({ stage, label }) => ({
      stage, label,
      matches: matches.filter((mt) => mt.stage === stage).sort((a, b) => a.kickoffAt - b.kickoffAt).map((mt) => ({
        home: mt.homeTeamId ? { team: teamLite(teamById.get(mt.homeTeamId))!, owner: ownerName(mt.homeTeamId) } : null,
        away: mt.awayTeamId ? { team: teamLite(teamById.get(mt.awayTeamId))!, owner: ownerName(mt.awayTeamId) } : null,
        homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
        winnerTeamId: (mt.winnerTeamId as string) ?? null, status: mt.status,
      })),
    })).filter((s) => s.matches.length > 0);

    return { groups, bracket };
  },
});
