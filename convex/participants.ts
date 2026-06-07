// convex/participants.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { newToken } from "./lib/tokens";
import { drawN } from "./lib/distribution";
import { teamLite, photoUrl, prizeView } from "./lib/view";
import { resolveQuiniela } from "./lib/perQuiniela";
import type { Id } from "./_generated/dataModel";
import type { PersonalData, PlayerStatus } from "./types";
import { insertNotification } from "./notifications";
import { playerJoinedNotice, teamsAssignedNotice, readyToDistributeNotice } from "./lib/notify";

export const joinQuiniela = mutation({
  args: { joinToken: v.string(), name: v.string(), photoId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    if (qn.status !== "open") throw new Error("Las inscripciones están cerradas");

    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const k = participants.length;
    if (k >= qn.numParticipants) throw new Error("Ya no hay lugares disponibles");

    const name = args.name.trim().slice(0, 40);
    if (!name) throw new Error("El nombre no puede estar vacío");
    const personalToken = newToken();
    const participantId = await ctx.db.insert("participants", {
      quinielaId: qn._id, name,
      photoId: args.photoId, personalToken, slotIndex: k, joinedAt: Date.now(),
    });

    // on_reveal: no teams until the admin reveals. on_join (default): draw a slot-sized
    // batch from the still-unowned pool right now.
    let assignedCount = 0;
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
      assignedCount = picked.length;
    }

    // Avisos: al admin (alguien se unió) y, si recibió equipos, al jugador. Si se llenó, al admin.
    await insertNotification(ctx, playerJoinedNotice(qn._id, name, participantId));
    if (assignedCount > 0) await insertNotification(ctx, teamsAssignedNotice(qn._id, participantId, assignedCount));
    if (k + 1 >= qn.numParticipants) await insertNotification(ctx, readyToDistributeNotice(qn._id));

    return { personalToken };
  },
});

export const setParticipantPaid = mutation({
  args: { adminToken: v.string(), participantId: v.id("participants"), paid: v.boolean() },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.participantId);
    if (!p) throw new Error("Participante no encontrado");
    const qn = await ctx.db.get(p.quinielaId);
    if (!qn || qn.adminToken !== args.adminToken) throw new Error("No autorizado");
    // ausente = no pagó (convención del schema); al desmarcar borramos el campo,
    // igual que updateNotes con `notes || undefined`.
    await ctx.db.patch(args.participantId, { paid: args.paid || undefined });
    return { ok: true as const };
  },
});

export const updateParticipantPhoto = mutation({
  args: { personalToken: v.string(), photoId: v.id("_storage") },
  handler: async (ctx, args) => {
    const me = await ctx.db
      .query("participants")
      .withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken))
      .first();
    if (!me) throw new Error("Jugador no encontrado");
    const oldPhotoId = me.photoId;
    await ctx.db.patch(me._id, { photoId: args.photoId });
    // La actualización del photoId ya quedó hecha arriba. El borrado de la foto
    // anterior es limpieza best-effort: si falla, preferimos dejar un blob huérfano
    // antes que revertir la mutación (transaccional) y perder el cambio del usuario.
    if (oldPhotoId && oldPhotoId !== args.photoId) {
      try {
        await ctx.storage.delete(oldPhotoId);
      } catch {
        console.warn("updateParticipantPhoto: no se pudo borrar la foto anterior", oldPhotoId);
      }
    }
    return { ok: true as const };
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

    const paidCount = participants.filter((p) => p.paid === true).length;
    return {
      quinielaId: qn._id as string, quinielaName: qn.name,
      prize: prizeView(qn, paidCount),
      status: (championParticipantId ? "finished" : qn.status) as "open" | "locked" | "finished",
      joinToken: qn.joinToken,
      me: { name: me.name, photoUrl: await photoUrl(ctx, me.photoId), status, aliveCount, totalCount: teamsOut.length },
      playingNow,
      teams: teamsOut,
    };
  },
});
