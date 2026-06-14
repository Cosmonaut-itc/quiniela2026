// convex/quinielas.ts
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { newToken } from "./lib/tokens";
import { computeSlotSizes, shuffleInPlace, balancedRedistribute } from "./lib/distribution";
import { teamLite, photoUrl, prizeView, sortPlayerTeams, gameModeOf } from "./lib/view";
import { resolveQuiniela } from "./lib/perQuiniela";
import { tournamentByCode, tournamentCodeOf } from "./lib/tournaments";
import type { OverviewData, PlayerStatus, AdminData, AssignMode, GameMode, TournamentInfo } from "./types";
import { insertNotification } from "./notifications";
import { quinielaClosedNotice, teamsAssignedNotice } from "./lib/notify";

/** Normalizes the stored (optional) assignMode; legacy rows without it are on_join. */
const modeOf = (qn: Doc<"quinielas">): AssignMode =>
  qn.assignMode === "on_reveal" ? "on_reveal" : "on_join";

// Shared by closeAndRedistribute (manual) and autoCloseDue (cron): assign every
// unowned team to the participant with the fewest teams, then lock the quiniela.
async function redistributeAndLock(
  ctx: MutationCtx,
  qn: Doc<"quinielas">,
  participants: Doc<"participants">[],
) {
  const owned = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
  const ownedSet = new Set(owned.map((o) => o.teamId));
  // Solo los equipos del torneo de la quiniela (normalización legacy: sin código = WC).
  const allTeams = (await ctx.db.query("teams").collect())
    .filter((tm) => tournamentCodeOf(tm) === tournamentCodeOf(qn));
  const leftovers = allTeams.filter((tm) => !ownedSet.has(tm._id)).map((tm) => tm._id as string);
  if (leftovers.length > 0) {
    const counts = participants.map((p) => ({
      participantId: p._id as string,
      count: owned.filter((o) => o.participantId === p._id).length,
    }));
    for (const a of balancedRedistribute(leftovers, counts, Math.random)) {
      await ctx.db.insert("ownerships", {
        quinielaId: qn._id,
        teamId: a.teamId as Id<"teams">,
        participantId: a.participantId as Id<"participants">,
      });
    }
  }
  await ctx.db.patch(qn._id, { status: "locked", lockedAt: Date.now() });

  // Avisos: la quiniela se cerró (a todos); en on_reveal recién recibieron equipos.
  const isReveal = modeOf(qn) === "on_reveal";
  const finalOwned = await ctx.db.query("ownerships")
    .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
  for (const p of participants) {
    await insertNotification(ctx, quinielaClosedNotice(qn._id, p._id));
    if (isReveal) {
      const teamCount = finalOwned.filter((o) => o.participantId === p._id).length;
      await insertNotification(ctx, teamsAssignedNotice(qn._id, p._id, teamCount));
    }
  }
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const updateQuinielaPhoto = mutation({
  args: { adminToken: v.string(), photoId: v.id("_storage") },
  handler: async (ctx, args) => {
    const qn = await ctx.db
      .query("quinielas")
      .withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken))
      .first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const oldPhotoId = qn.photoId;
    await ctx.db.patch(qn._id, { photoId: args.photoId });
    // El borrado de la foto anterior es limpieza best-effort: si falla, preferimos
    // dejar un blob huérfano antes que revertir la mutación y perder el cambio
    // (mismo tradeoff que updateParticipantPhoto).
    if (oldPhotoId && oldPhotoId !== args.photoId) {
      try {
        await ctx.storage.delete(oldPhotoId);
      } catch {
        console.warn("updateQuinielaPhoto: no se pudo borrar la foto anterior", oldPhotoId);
      }
    }
    return { ok: true as const };
  },
});

export const createQuiniela = mutation({
  args: {
    name: v.string(),
    prizeText: v.string(),
    numParticipants: v.number(),
    photoId: v.optional(v.id("_storage")),
    assignMode: v.optional(v.string()), // "on_join" | "on_reveal"
    prizeMode: v.optional(v.string()),  // "fixed" | "per_person"
    entryFee: v.optional(v.number()),   // requerido en per_person
    notes: v.optional(v.string()),
    gameMode: v.optional(v.string()),   // "clasica" | "progol"
    tournamentCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- validación de torneo ---
    const code = args.tournamentCode ?? "WC";
    const tournament = tournamentByCode(code);
    if (!tournament) throw new Error("Torneo fuera del catálogo");
    const isProgol = args.gameMode === "progol";
    if (!isProgol && tournament.format !== "eliminatorio")
      throw new Error(`${tournament.name} no admite Clásica (solo Progol)`);
    const allTeams = await ctx.db.query("teams").collect();
    const teamCount = allTeams.filter((t) => tournamentCodeOf(t) === code).length;
    if (teamCount === 0) throw new Error("Torneo sin datos; prepáralo primero");
    // --- cálculo de slots ---
    // progol: sin tope (centinela 0) ni reparto de equipos (slotSizes vacío).
    const n = isProgol ? 0 : Math.max(1, Math.min(teamCount, Math.floor(args.numParticipants)));
    const slotSizes = isProgol ? [] : shuffleInPlace(computeSlotSizes(n, teamCount), Math.random);
    const adminToken = newToken();
    const joinToken = newToken();
    const perPerson = args.prizeMode === "per_person";
    const entryFee = perPerson ? Math.max(1, Math.floor(args.entryFee ?? 0)) : undefined;
    const notes = (args.notes ?? "").trim().slice(0, 1000);
    const quinielaId = await ctx.db.insert("quinielas", {
      name: args.name.trim().slice(0, 60),
      prizeText: perPerson ? "" : args.prizeText.trim().slice(0, 60),
      prizeMode: perPerson ? "per_person" : "fixed",
      entryFee,
      numParticipants: n,
      slotSizes,
      adminToken,
      joinToken,
      status: "open",
      assignMode: args.assignMode === "on_reveal" ? "on_reveal" : "on_join",
      gameMode: isProgol ? "progol" : "clasica",
      photoId: args.photoId,
      notes: notes || undefined,
      createdAt: Date.now(),
      tournamentCode: code,
    });
    return { quinielaId, adminToken, joinToken };
  },
});

export const updateNotes = mutation({
  args: { adminToken: v.string(), notes: v.string() },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const notes = args.notes.trim().slice(0, 1000);
    await ctx.db.patch(qn._id, { notes: notes || undefined });
    return { ok: true as const };
  },
});

export const closeAndRedistribute = mutation({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    if (qn.status !== "open") return { ok: true as const };

    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    if (participants.length === 0) throw new Error("No hay participantes");

    await redistributeAndLock(ctx, qn, participants);
    return { ok: true as const };
  },
});

// Cron: cuando arranca el primer partido DEL TORNEO de cada quiniela, cierra las
// quinielas abiertas de ese torneo. Clásica exige al menos un participante (las vacías
// quedan abiertas para que nadie pierda su lugar); progol cierra la inscripción siempre.
export const autoCloseDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db.query("quinielas").withIndex("by_status", (q) => q.eq("status", "open")).collect();
    if (open.length === 0) return;
    const allMatches = await ctx.db.query("matches").collect();
    const firstKickoffByCode = new Map<string, number>();
    for (const mt of allMatches) {
      const code = tournamentCodeOf(mt);
      const prev = firstKickoffByCode.get(code);
      if (prev === undefined || mt.kickoffAt < prev) firstKickoffByCode.set(code, mt.kickoffAt);
    }
    for (const qn of open) {
      const first = firstKickoffByCode.get(tournamentCodeOf(qn));
      if (first === undefined || Date.now() < first) continue;
      if (gameModeOf(qn) === "progol") {
        // progol no reparte equipos; al arrancar el torneo solo cierra la inscripción.
        await ctx.db.patch(qn._id, { status: "locked", lockedAt: Date.now() });
        continue;
      }
      if (modeOf(qn) === "on_reveal") continue; // reveal is manual-only; never auto-distribute
      const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      if (participants.length === 0) continue; // leave empty quinielas open
      await redistributeAndLock(ctx, qn, participants);
    }
  },
});

export const getOverview = query({
  args: { joinToken: v.string() },
  handler: async (ctx, args): Promise<OverviewData> => {
    const qn = await ctx.db.query("quinielas").withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");

    const { teamById, effRows, states, championTeamId: champTeam } = await resolveQuiniela(ctx, qn._id);
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));
    const championParticipantId = champTeam ? ownerByTeam.get(champTeam as Id<"teams">) ?? null : null;

    // on_reveal quinielas hand out no teams until the admin reveals (which locks them),
    // so an open on_reveal player is "pending", not eliminated.
    const pendingReveal = modeOf(qn) === "on_reveal" && qn.status === "open";
    const players = participants.map((p) => {
      const mine = ownerships.filter((o) => o.participantId === p._id);
      const aliveCount = mine.filter((o) => states.get(o.teamId as string)!.alive).length;
      const isChampion = championParticipantId === p._id;
      const status: PlayerStatus = pendingReveal ? "pending"
        : isChampion ? "champion" : aliveCount > 0 ? "alive" : "out";
      const teams = sortPlayerTeams(
        mine.map((o) => ({
          team: teamLite(teamById.get(o.teamId as Id<"teams">))!,
          alive: states.get(o.teamId as string)!.alive,
        })),
      );
      return { participantId: p._id as string, name: p.name,
        photoUrlId: p.photoId, aliveCount, totalCount: mine.length, status, teams };
    });
    players.sort((a, b) =>
      (b.status === "out" ? 0 : 1) - (a.status === "out" ? 0 : 1) || b.aliveCount - a.aliveCount);

    // upcoming duels: next scheduled matches where both teams owned in this quiniela
    const upcoming = [...effRows]
      .filter((mt) => mt.status !== "finished" && mt.homeTeamId && mt.awayTeamId
        && ownerByTeam.has(mt.homeTeamId as Id<"teams">) && ownerByTeam.has(mt.awayTeamId as Id<"teams">))
      .sort((a, b) => a.kickoffAt - b.kickoffAt)
      .slice(0, 8);
    const nameById = new Map(participants.map((p) => [p._id, p.name]));
    const paidCount = participants.filter((p) => p.paid === true).length;

    return {
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId),
        prize: prizeView(qn, paidCount),
        numParticipants: qn.numParticipants, filledCount: participants.length,
        status: (championParticipantId ? "finished" : qn.status) as "open" | "locked" | "finished",
        assignMode: modeOf(qn),
        notes: qn.notes ?? null,
      },
      players: await Promise.all(players.map(async (p) => ({
        participantId: p.participantId, name: p.name, photoUrl: await photoUrl(ctx, p.photoUrlId),
        aliveCount: p.aliveCount, totalCount: p.totalCount, status: p.status, teams: p.teams,
      }))),
      freeSlots: Math.max(0, qn.numParticipants - participants.length),
      upcomingDuels: upcoming.map((mt) => ({
        homeOwner: nameById.get(ownerByTeam.get(mt.homeTeamId as Id<"teams">)!) ?? "",
        homeTeam: teamLite(teamById.get(mt.homeTeamId as Id<"teams">))!,
        awayOwner: nameById.get(ownerByTeam.get(mt.awayTeamId as Id<"teams">)!) ?? "",
        awayTeam: teamLite(teamById.get(mt.awayTeamId as Id<"teams">))!,
        kickoffAt: mt.kickoffAt,
      })),
    };
  },
});

export const getAdmin = query({
  args: { adminToken: v.string() },
  handler: async (ctx, args): Promise<AdminData> => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const { teamById, effById, overriddenMatchIds, matches, championTeamId: champTeam } = await resolveQuiniela(ctx, qn._id);
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));
    const championParticipantId = champTeam ? ownerByTeam.get(champTeam as Id<"teams">) ?? null : null;

    const STAGE_LABEL: Record<string, string> = {
      group: "Grupos", r32: "Dieciseisavos", r16: "Octavos", qf: "Cuartos",
      sf: "Semis", third: "3er lugar", final: "Final",
    };
    const sorted = [...matches].sort((a, b) => a.kickoffAt - b.kickoffAt);
    const paidCount = participants.filter((p) => p.paid === true).length;
    const efectivoCount = participants.filter((p) => p.paymentMethod === "efectivo").length;
    const transferenciaCount = participants.filter((p) => p.paymentMethod === "transferencia").length;
    return {
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId),
        prize: prizeView(qn, paidCount),
        numParticipants: qn.numParticipants, filledCount: participants.length,
        status: (championParticipantId ? "finished" : qn.status) as "open" | "locked" | "finished",
        joinToken: qn.joinToken, assignMode: modeOf(qn),
        notes: qn.notes ?? null,
        methodCounts: { efectivo: efectivoCount, transferencia: transferenciaCount },
      },
      participants: participants.map((p) => ({
        id: p._id as string, name: p.name, personalToken: p.personalToken,
        teamCount: ownerships.filter((o) => o.participantId === p._id).length,
        paid: p.paid === true,
        paymentMethod: p.paymentMethod ?? null,
      })),
      matches: sorted.map((mt) => {
        const e = effById.get(mt._id as string)!;
        const winner = e.winnerTeamId ? teamById.get(e.winnerTeamId as Id<"teams">) : null;
        return {
          externalId: mt.externalId, stage: mt.stage, label: STAGE_LABEL[mt.stage] ?? mt.stage,
          homeTeam: mt.homeTeamId ? teamLite(teamById.get(mt.homeTeamId)) : null,
          awayTeam: mt.awayTeamId ? teamLite(teamById.get(mt.awayTeamId)) : null,
          homeExternalId: mt.homeTeamId ? teamById.get(mt.homeTeamId)?.externalId ?? null : null,
          awayExternalId: mt.awayTeamId ? teamById.get(mt.awayTeamId)?.externalId ?? null : null,
          homeScore: e.homeScore, awayScore: e.awayScore, status: e.status,
          winnerExternalId: winner?.externalId ?? null,
          manualOverride: overriddenMatchIds.has(mt._id as string),
        };
      }),
    };
  },
});

export const getMode = query({
  args: { id: v.id("quinielas") },
  handler: async (ctx, args): Promise<{ gameMode: GameMode; tournament: TournamentInfo }> => {
    const qn = await ctx.db.get(args.id);
    if (!qn) throw new Error("Quiniela no encontrada");
    // Mismo fallback que getTorneo para códigos fuera del catálogo: el code crudo.
    const code = tournamentCodeOf(qn);
    const t = tournamentByCode(code);
    return {
      gameMode: gameModeOf(qn),
      tournament: { code, shortName: t?.shortName ?? code, format: t?.format ?? "eliminatorio" },
    };
  },
});
