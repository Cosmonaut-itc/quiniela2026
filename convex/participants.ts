// convex/participants.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { newToken } from "./lib/tokens";
import { drawN } from "./lib/distribution";
import { teamLite, photoUrl, prizeView } from "./lib/view";
import { resolveQuiniela } from "./lib/perQuiniela";
import type { Id } from "./_generated/dataModel";
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

    const personalToken = newToken();
    const participantId = await ctx.db.insert("participants", {
      quinielaId: qn._id, name: args.name.trim().slice(0, 40),
      photoId: args.photoId, personalToken, slotIndex: k, joinedAt: Date.now(),
    });

    // on_reveal: no teams until the admin reveals. on_join (default): draw a slot-sized
    // batch from the still-unowned pool right now.
    if (qn.assignMode !== "on_reveal") {
      const size = qn.slotSizes[k];
      const owned = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      const ownedSet = new Set(owned.map((o) => o.teamId));
      const allTeams = await ctx.db.query("teams").collect();
      const pool = allTeams.filter((tm) => !ownedSet.has(tm._id)).map((tm) => tm._id);
      const { picked } = drawN(pool, size, Math.random);
      for (const teamId of picked) {
        await ctx.db.insert("ownerships", { quinielaId: qn._id, teamId, participantId });
      }
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

    const { teamById, effRows, states, championTeamId: champTeam } = await resolveQuiniela(ctx, me.quinielaId);
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const nameById = new Map(participants.map((p) => [p._id, p.name]));
    const championParticipantId = champTeam ? ownerByTeam.get(champTeam as Id<"teams">) ?? null : null;

    const myTeamIds = ownerships.filter((o) => o.participantId === me._id).map((o) => o.teamId);

    function nextMatchFor(teamId: string) {
      return effRows
        .filter((mt) => mt.status !== "finished" && (mt.homeTeamId === teamId || mt.awayTeamId === teamId))
        .sort((a, b) => a.kickoffAt - b.kickoffAt)[0];
    }
    function lastResultFor(teamId: string) {
      const mt = effRows
        .filter((x) => x.status === "finished" && (x.homeTeamId === teamId || x.awayTeamId === teamId))
        .sort((a, b) => b.kickoffAt - a.kickoffAt)[0];
      if (!mt) return null;
      const h = teamById.get(mt.homeTeamId as Id<"teams">); const aw = teamById.get(mt.awayTeamId as Id<"teams">);
      return `${h?.flag ?? ""} ${mt.homeScore}–${mt.awayScore} ${aw?.flag ?? ""}`;
    }

    const teamsOut = myTeamIds.map((teamId) => {
      const tm = teamById.get(teamId)!;
      const nm = nextMatchFor(teamId as string);
      let nextMatch = null as PersonalData["teams"][number]["nextMatch"];
      if (nm) {
        const oppId = nm.homeTeamId === (teamId as string) ? nm.awayTeamId : nm.homeTeamId;
        if (oppId) {
          nextMatch = {
            opponent: teamLite(teamById.get(oppId as Id<"teams">))!,
            opponentOwner: ownerByTeam.has(oppId as Id<"teams">) ? nameById.get(ownerByTeam.get(oppId as Id<"teams">)!) ?? "—" : "Sin dueño",
            kickoffAt: nm.kickoffAt,
          };
        }
      }
      return { team: teamLite(tm)!, alive: states.get(teamId as string)!.alive, group: tm.group, nextMatch, lastResult: lastResultFor(teamId as string) };
    });

    const aliveCount = teamsOut.filter((x) => x.alive).length;
    // on_reveal antes de repartir: el jugador se unió pero aún no tiene equipos.
    const pendingReveal = qn.assignMode === "on_reveal" && qn.status === "open";
    const status: PlayerStatus = pendingReveal ? "pending"
      : championParticipantId === me._id ? "champion" : aliveCount > 0 ? "alive" : "out";

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
      quinielaId: qn._id as string, quinielaName: qn.name,
      prize: prizeView(qn, participants.length),
      status: (championParticipantId ? "finished" : qn.status) as "open" | "locked" | "finished",
      joinToken: qn.joinToken,
      me: { name: me.name, photoUrl: await photoUrl(ctx, me.photoId), status, aliveCount, totalCount: teamsOut.length },
      playingNow,
      teams: teamsOut,
    };
  },
});
