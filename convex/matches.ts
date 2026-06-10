// convex/matches.ts
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { computeTeamStates, type MatchRow, type TeamRow } from "./lib/tournament";
import { tournamentByCode, tournamentCodeOf } from "./lib/tournaments";

const apiMatch = v.object({
  externalId: v.string(),
  stage: v.string(),
  group: v.union(v.string(), v.null()),
  matchday: v.union(v.number(), v.null()),
  homeExternalId: v.union(v.string(), v.null()),
  awayExternalId: v.union(v.string(), v.null()),
  kickoffAt: v.number(),
  homeScore: v.union(v.number(), v.null()),
  awayScore: v.union(v.number(), v.null()),
  status: v.string(),
  winnerExternalId: v.optional(v.union(v.string(), v.null())),
  bracketSlot: v.union(v.string(), v.null()),
});

// Busca el id del equipo dentro del torneo indicado.
// Fallback legacy: filas WC pre-backfill no tienen tournamentCode aún; se aceptan
// solo si tournamentCode === "WC" y la fila carece de tournamentCode.
async function teamIdByExternal(
  ctx: MutationCtx,
  tournamentCode: string,
  ext: string | null,
): Promise<Id<"teams"> | undefined> {
  if (!ext) return undefined;
  const t = await ctx.db
    .query("teams")
    .withIndex("by_tournament_externalId", (q) =>
      q.eq("tournamentCode", tournamentCode).eq("externalId", ext),
    )
    .first();
  if (t) return t._id;
  // Fallback legacy WC: filas pre-backfill no tienen tournamentCode
  if (tournamentCode !== "WC") return undefined;
  const legacy = await ctx.db
    .query("teams")
    .withIndex("by_externalId", (q) => q.eq("externalId", ext))
    .filter((q) => q.eq(q.field("tournamentCode"), undefined))
    .first();
  return legacy?._id;
}

// Resuelve un partido DENTRO del torneo indicado. Dos torneos pueden compartir
// externalId (las selecciones WC/EC comparten ids de football-data), así que se busca
// scoped por torneo primero, con el fallback legacy WC (filas pre-backfill sin
// tournamentCode). Si el partido solo existe en otro torneo, se rechaza.
async function matchByExternalScoped(
  ctx: MutationCtx,
  tournamentCode: string,
  externalId: string,
) {
  let match = await ctx.db
    .query("matches")
    .withIndex("by_tournament_externalId", (q) =>
      q.eq("tournamentCode", tournamentCode).eq("externalId", externalId),
    )
    .first();
  if (!match && tournamentCode === "WC") {
    match = await ctx.db
      .query("matches")
      .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
      .filter((q) => q.eq(q.field("tournamentCode"), undefined))
      .first();
  }
  if (match) return match;
  const global = await ctx.db
    .query("matches")
    .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
    .first();
  if (global) throw new Error("Partido de otro torneo");
  throw new Error("Partido no encontrado");
}

function winnerOf(
  homeId: Id<"teams"> | undefined,
  awayId: Id<"teams"> | undefined,
  hs: number | null,
  as: number | null,
): Id<"teams"> | undefined {
  if (hs == null || as == null) return undefined;
  if (hs > as) return homeId;
  if (as > hs) return awayId;
  // Score-based fallback only: an equal score yields no winner here. The authoritative
  // knockout winner (incl. extra time / penalties) comes from match.winnerExternalId.
  return undefined;
}

export const upsertTeam = internalMutation({
  args: {
    tournamentCode: v.string(),
    format: v.union(v.literal("eliminatorio"), v.literal("liga")),
    team: v.object({
      externalId: v.string(),
      name: v.string(),
      code: v.string(),
      crest: v.string(),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { tournamentCode, format, team }) => {
    const existing = await ctx.db
      .query("teams")
      .withIndex("by_tournament_externalId", (q) =>
        q.eq("tournamentCode", tournamentCode).eq("externalId", team.externalId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { name: team.name, code: team.code, flag: team.crest });
      return null;
    }
    // Fallback legacy: filas WC pre-backfill no tienen tournamentCode; las parchamos en lugar
    // de insertar un duplicado (48 selecciones nacionales compartirían externalId con EC/WC).
    if (tournamentCode === "WC") {
      const legacy = await ctx.db
        .query("teams")
        .withIndex("by_externalId", (q) => q.eq("externalId", team.externalId))
        .filter((q) => q.eq(q.field("tournamentCode"), undefined))
        .first();
      if (legacy) {
        await ctx.db.patch(legacy._id, {
          name: team.name,
          code: team.code,
          flag: team.crest,
          tournamentCode,
        });
        return null;
      }
    }
    await ctx.db.insert("teams", {
      code: team.code,
      name: team.name,
      flag: team.crest,
      group: "", // los eliminatorios reciben grupo desde sus partidos de grupos
      alive: true,
      currentStage: format === "liga" ? "league" : "group",
      externalId: team.externalId,
      tournamentCode,
    });
    return null;
  },
});

export const upsertMatchResult = internalMutation({
  args: { tournamentCode: v.string(), match: apiMatch },
  returns: v.null(),
  handler: async (ctx, { tournamentCode, match }) => {
    // Buscar por torneo primero; fallback legacy para WC sin tournamentCode
    let existing = await ctx.db
      .query("matches")
      .withIndex("by_tournament_externalId", (q) =>
        q.eq("tournamentCode", tournamentCode).eq("externalId", match.externalId),
      )
      .first();
    if (!existing && tournamentCode === "WC") {
      existing = await ctx.db
        .query("matches")
        .withIndex("by_externalId", (q) => q.eq("externalId", match.externalId))
        .filter((q) => q.eq(q.field("tournamentCode"), undefined))
        .first();
    }

    const homeTeamId =
      (await teamIdByExternal(ctx, tournamentCode, match.homeExternalId)) ?? existing?.homeTeamId;
    const awayTeamId =
      (await teamIdByExternal(ctx, tournamentCode, match.awayExternalId)) ?? existing?.awayTeamId;
    // Prefer the API's explicit winner (covers ET/penalties where scores are equal);
    // fall back to the score-derived winner only when no explicit winner is given.
    const winnerTeamId =
      match.status !== "finished"
        ? undefined
        : typeof match.winnerExternalId === "string"
          ? await teamIdByExternal(ctx, tournamentCode, match.winnerExternalId)
          : winnerOf(homeTeamId, awayTeamId, match.homeScore, match.awayScore);

    const fields = {
      stage: match.stage,
      group: match.group ?? undefined,
      matchday: match.matchday ?? undefined, // null is not storable; schema uses v.optional(v.number())
      tournamentCode,
      homeTeamId,
      awayTeamId,
      kickoffAt: match.kickoffAt,
      homeScore: match.homeScore ?? undefined,
      awayScore: match.awayScore ?? undefined,
      status: match.status,
      winnerTeamId,
      externalId: match.externalId,
      bracketSlot: match.bracketSlot ?? existing?.bracketSlot,
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("matches", fields);

    // Si el partido tiene grupo y algún equipo aún no tiene grupo asignado, asignárselo
    if (match.group) {
      for (const tid of [homeTeamId, awayTeamId]) {
        if (!tid) continue;
        const tm = await ctx.db.get(tid);
        if (tm && tm.group === "") await ctx.db.patch(tid, { group: match.group });
      }
    }
    return null;
  },
});

export const recomputeTeamStates = internalMutation({
  args: { tournamentCode: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Solo aplica a torneos eliminatorios
    if (tournamentByCode(args.tournamentCode)?.format !== "eliminatorio") return null;

    // Cargar equipos del torneo (incluyendo legacy WC sin tournamentCode)
    const scopedTeams = await ctx.db
      .query("teams")
      .withIndex("by_tournament", (q) => q.eq("tournamentCode", args.tournamentCode))
      .collect();

    // TODO: eliminar el concat legacy una vez que backfillTournamentCode esté verificado en producción (SEN-16)
    const teams =
      args.tournamentCode === "WC"
        ? [
            ...scopedTeams,
            // Fallback: filas WC pre-backfill no tienen tournamentCode
            ...(await ctx.db.query("teams").collect()).filter(
              (t) => t.tournamentCode === undefined,
            ),
          ]
        : scopedTeams;

    // Cargar partidos del torneo (incluyendo legacy WC sin tournamentCode)
    const scopedMatches = await ctx.db
      .query("matches")
      .withIndex("by_tournament_kickoff", (q) =>
        q.eq("tournamentCode", args.tournamentCode),
      )
      .collect();

    const matches =
      args.tournamentCode === "WC"
        ? [
            ...scopedMatches,
            ...(await ctx.db.query("matches").collect()).filter(
              (mt) => mt.tournamentCode === undefined,
            ),
          ]
        : scopedMatches;

    const states = computeTeamStates(
      teams.map((t) => ({ _id: t._id, group: t.group })) as TeamRow[],
      matches.map((mt) => ({
        _id: mt._id,
        stage: mt.stage,
        group: mt.group,
        homeTeamId: mt.homeTeamId ?? null,
        awayTeamId: mt.awayTeamId ?? null,
        homeScore: mt.homeScore ?? null,
        awayScore: mt.awayScore ?? null,
        status: mt.status,
        winnerTeamId: mt.winnerTeamId ?? null,
        kickoffAt: mt.kickoffAt,
      })) as MatchRow[],
    );
    // Baseline de la API: el estado global de equipos = lo que ve una quiniela SIN
    // overrides. Las vistas por quiniela siempre derivan (resolveQuiniela), así que el
    // campeón y el status "finished" se calculan por quiniela en lectura, no aquí: este
    // recompute ya NO finaliza ninguna quiniela (eso cruzaba quinielas y era la fuga).
    for (const t of teams) {
      const s = states.get(t._id)!;
      if (t.alive !== s.alive || t.currentStage !== s.currentStage) {
        await ctx.db.patch(t._id, {
          alive: s.alive,
          currentStage: s.currentStage,
          eliminatedAt: s.eliminatedAt,
        });
      }
    }
    return null;
  },
});

// Corrección manual del admin: escribe un override SOLO para su quiniela (tabla
// matchOverrides). El partido global nunca se toca; cada quiniela ve la verdad de
// la API con sus propias correcciones encima (derivado en lectura por resolveQuiniela).
export const setMatchResultManual = mutation({
  args: {
    adminToken: v.string(),
    matchExternalId: v.string(),
    homeScore: v.number(),
    awayScore: v.number(),
    finished: v.boolean(),
    winnerExternalId: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const qn = await ctx.db
      .query("quinielas")
      .withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken))
      .first();
    if (!qn) throw new Error("Quiniela no encontrada");
    // Usar el tournamentCode de la quiniela (fallback a "WC") para resolver el partido
    // y al ganador; un partido de otro torneo se rechaza.
    const tCode = tournamentCodeOf(qn);
    const match = await matchByExternalScoped(ctx, tCode, args.matchExternalId);
    // An explicit winner lets an admin resolve a tied knockout (penalties / extra time);
    // otherwise fall back to the score (home>away→home, away>home→away, tie→none).
    const winnerTeamId = !args.finished
      ? undefined
      : typeof args.winnerExternalId === "string"
        ? await teamIdByExternal(ctx, tCode, args.winnerExternalId)
        : args.homeScore > args.awayScore
          ? match.homeTeamId
          : args.awayScore > args.homeScore
            ? match.awayTeamId
            : undefined;
    const fields = {
      quinielaId: qn._id,
      matchId: match._id,
      homeScore: args.homeScore,
      awayScore: args.awayScore,
      status: args.finished ? "finished" : "live",
      winnerTeamId,
    };
    const existing = await ctx.db
      .query("matchOverrides")
      .withIndex("by_quiniela_match", (q) =>
        q.eq("quinielaId", qn._id).eq("matchId", match._id),
      )
      .first();
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("matchOverrides", fields);
    return { ok: true as const };
  },
});

// Revertir: borra el override de esa quiniela; el partido vuelve a seguir la API/cron
// SOLO en esa quiniela. Idempotente si no había override.
export const clearMatchOverride = mutation({
  args: { adminToken: v.string(), matchExternalId: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const qn = await ctx.db
      .query("quinielas")
      .withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken))
      .first();
    if (!qn) throw new Error("Quiniela no encontrada");
    // Resolver el partido dentro del torneo de la quiniela; otro torneo se rechaza.
    const match = await matchByExternalScoped(ctx, tournamentCodeOf(qn), args.matchExternalId);
    const existing = await ctx.db
      .query("matchOverrides")
      .withIndex("by_quiniela_match", (q) =>
        q.eq("quinielaId", qn._id).eq("matchId", match._id),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true as const };
  },
});
