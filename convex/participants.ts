// convex/participants.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { newToken } from "./lib/tokens";
import { drawN } from "./lib/distribution";
import { teamLite, photoUrl } from "./lib/view";
import type { PersonalData, PlayerStatus } from "./types";

export const joinQuiniela = mutation({
  args: { joinToken: v.string(), name: v.string(), photoId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    if (qn.status !== "open") throw new Error("Las inscripciones están cerradas");

    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const k = participants.length;
    if (k >= qn.numParticipants) throw new Error("Ya no hay lugares disponibles");

    const size = qn.slotSizes[k];

    // pool = teams not yet owned in this quiniela
    const owned = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownedSet = new Set(owned.map((o) => o.teamId));
    const allTeams = await ctx.db.query("teams").collect();
    const pool = allTeams.filter((tm) => !ownedSet.has(tm._id)).map((tm) => tm._id);

    const { picked } = drawN(pool, size, Math.random);

    const personalToken = newToken();
    const participantId = await ctx.db.insert("participants", {
      quinielaId: qn._id, name: args.name.trim().slice(0, 40),
      photoId: args.photoId, personalToken, slotIndex: k, joinedAt: Date.now(),
    });
    for (const teamId of picked) {
      await ctx.db.insert("ownerships", { quinielaId: qn._id, teamId, participantId });
    }
    return { personalToken };
  },
});

export const getPersonalPanel = query({
  args: { personalToken: v.string() },
  handler: async (ctx, args): Promise<PersonalData> => {
    const me = await ctx.db.query("participants").withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken)).first();
    if (!me) throw new Error("Jugador no encontrado");
    const qn = await ctx.db.get(me.quinielaId);
    if (!qn) throw new Error("Quiniela no encontrada");

    const teams = await ctx.db.query("teams").collect();
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const nameById = new Map(participants.map((p) => [p._id, p.name]));

    const myTeamIds = ownerships.filter((o) => o.participantId === me._id).map((o) => o.teamId);
    const allMatches = await ctx.db.query("matches").withIndex("by_kickoff").collect();

    function nextMatchFor(teamId: string) {
      return allMatches
        .filter((mt) => mt.status !== "finished" && (mt.homeTeamId === teamId || mt.awayTeamId === teamId))
        .sort((a, b) => a.kickoffAt - b.kickoffAt)[0];
    }
    function lastResultFor(teamId: string) {
      const m = allMatches
        .filter((mt) => mt.status === "finished" && (mt.homeTeamId === teamId || mt.awayTeamId === teamId))
        .sort((a, b) => b.kickoffAt - a.kickoffAt)[0];
      if (!m) return null;
      const h = teamById.get(m.homeTeamId!); const aw = teamById.get(m.awayTeamId!);
      return `${h?.flag ?? ""} ${m.homeScore}–${m.awayScore} ${aw?.flag ?? ""}`;
    }

    const teamsOut = myTeamIds.map((teamId) => {
      const tm = teamById.get(teamId)!;
      const nm = nextMatchFor(teamId);
      let nextMatch = null as PersonalData["teams"][number]["nextMatch"];
      if (nm) {
        const oppId = nm.homeTeamId === teamId ? nm.awayTeamId : nm.homeTeamId;
        if (oppId) {
          nextMatch = {
            opponent: teamLite(teamById.get(oppId))!,
            opponentOwner: ownerByTeam.has(oppId) ? nameById.get(ownerByTeam.get(oppId)!) ?? "—" : "Sin dueño",
            kickoffAt: nm.kickoffAt,
          };
        }
      }
      return { team: teamLite(tm)!, alive: tm.alive, group: tm.group, nextMatch, lastResult: lastResultFor(teamId) };
    });

    const aliveCount = teamsOut.filter((x) => x.alive).length;
    const status: PlayerStatus = qn.championParticipantId === me._id ? "champion" : aliveCount > 0 ? "alive" : "out";

    // playingNow: my teams whose next match is live or starts within 3h
    const soon = Date.now() + 3 * 3600_000;
    const playingNow = teamsOut
      .filter((x) => x.nextMatch && x.nextMatch.kickoffAt <= soon)
      .map((x) => ({
        myTeam: x.team, opponent: x.nextMatch!.opponent, opponentOwner: x.nextMatch!.opponentOwner,
        kickoffAt: x.nextMatch!.kickoffAt,
        status: (x.nextMatch!.kickoffAt <= Date.now() ? "live" : "scheduled") as "live" | "scheduled",
      }));

    return {
      quinielaId: qn._id as string, quinielaName: qn.name, prizeText: qn.prizeText,
      me: { name: me.name, photoUrl: await photoUrl(ctx, me.photoId), status, aliveCount, totalCount: teamsOut.length },
      playingNow,
      teams: teamsOut,
    };
  },
});
