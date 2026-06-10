// convex/mundial.ts
import { query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { teamLite, photoUrl, gameModeOf } from "./lib/view";
import { computeGroupStandings } from "./lib/tournament";
import { computeLeagueStandings } from "./lib/standings";
import { resolveQuiniela } from "./lib/perQuiniela";
import { tournamentByCode, tournamentCodeOf } from "./lib/tournaments";
import type { MundialData, TorneoData } from "./types";

const BRACKET_STAGES: { stage: string; label: string }[] = [
  { stage: "r32", label: "Dieciseisavos" },
  { stage: "r16", label: "Octavos" },
  { stage: "qf", label: "Cuartos" },
  { stage: "sf", label: "Semifinales" },
  { stage: "third", label: "Tercer lugar" },
  { stage: "final", label: "Final" },
];

async function buildBrackets(ctx: QueryCtx, quinielaId: Id<"quinielas">): Promise<MundialData> {
  const { teams, teamById, teamRows, matches, effRows, effById, states } = await resolveQuiniela(ctx, quinielaId);
  const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId)).collect();
  const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId)).collect();
  const nameById = new Map(participants.map((p) => [p._id, p]));
  const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));

  const ownerName = (teamId?: Id<"teams"> | string | null) => {
    const tid = teamId as Id<"teams"> | null | undefined;
    return tid && ownerByTeam.has(tid) ? nameById.get(ownerByTeam.get(tid)!)?.name ?? "—" : "Sin dueño";
  };

  const groupLetters = [...new Set(teams.map((t) => t.group))].sort();
  const groups = await Promise.all(groupLetters.map(async (g) => {
    const standings = computeGroupStandings(g, teamRows, effRows);
    const rows = await Promise.all(standings.map(async (s) => {
      const teamId = s.teamId as Id<"teams">;
      const tm = teamById.get(teamId)!;
      const ownerId = ownerByTeam.get(teamId);
      return {
        team: teamLite(tm)!, points: s.points, gd: s.gd, gf: s.gf,
        ownerName: ownerName(teamId), alive: states.get(teamId as string)!.alive,
        ownerPhotoUrl: ownerId ? await photoUrl(ctx, nameById.get(ownerId)?.photoId) : null,
      };
    }));
    return { group: g, rows };
  }));

  const bracket = BRACKET_STAGES.map(({ stage, label }) => ({
    stage, label,
    matches: matches.filter((mt) => mt.stage === stage).sort((a, b) => a.kickoffAt - b.kickoffAt).map((mt) => {
      const e = effById.get(mt._id as string)!;
      return {
        home: mt.homeTeamId ? { team: teamLite(teamById.get(mt.homeTeamId))!, owner: ownerName(mt.homeTeamId) } : null,
        away: mt.awayTeamId ? { team: teamLite(teamById.get(mt.awayTeamId))!, owner: ownerName(mt.awayTeamId) } : null,
        homeScore: e.homeScore, awayScore: e.awayScore,
        winnerTeamId: e.winnerTeamId, status: e.status,
      };
    }),
  })).filter((s) => s.matches.length > 0);

  const qn = await ctx.db.get(quinielaId);
  const showOwners = qn ? gameModeOf(qn) === "clasica" : true;
  return { showOwners, groups, bracket };
}

/** Vista Torneo adaptativa: brackets en eliminatorios, tabla de posiciones en ligas. */
export const getTorneo = query({
  args: { quinielaId: v.id("quinielas") },
  handler: async (ctx, { quinielaId }): Promise<TorneoData> => {
    const qn = await ctx.db.get(quinielaId);
    if (!qn) throw new Error("Quiniela no encontrada");
    const code = tournamentCodeOf(qn);
    const t = tournamentByCode(code) ?? { code, shortName: code, format: "eliminatorio" as const };
    const tournament = { code: t.code, shortName: t.shortName, format: t.format };
    if (t.format === "liga") {
      const { teamById, teamRows, effRows } = await resolveQuiniela(ctx, quinielaId);
      const standings = computeLeagueStandings(teamRows, effRows).map((s) => ({
        team: teamLite(teamById.get(s.teamId as Id<"teams">))!,
        points: s.points, played: s.played, gd: s.gd, gf: s.gf,
      }));
      return { kind: "league", tournament, standings };
    }
    return { kind: "brackets", tournament, ...(await buildBrackets(ctx, quinielaId)) };
  },
});

// Alias para clientes ya desplegados (la web previa al multi-torneo consulta getMundial).
export const getMundial = query({
  args: { quinielaId: v.id("quinielas") },
  handler: async (ctx, { quinielaId }): Promise<MundialData> => buildBrackets(ctx, quinielaId),
});
