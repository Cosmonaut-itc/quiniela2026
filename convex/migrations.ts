// convex/migrations.ts
import { internalMutation } from "./_generated/server";
import { tournamentCodeOf } from "./lib/tournaments";
import { computeQualifiers, type MatchRow, type TeamRow } from "./lib/tournament";

// Backfill puntual post multi-torneo: toda fila sin tournamentCode es del
// Mundial (la app era mono-torneo). Idempotente: solo patchea las que faltan.
// Ejecutar una vez tras desplegar el schema: npx convex run migrations:backfillTournamentCode --prod
export const backfillTournamentCode = internalMutation({
  args: {},
  handler: async (ctx) => {
    let patched = 0;
    for (const table of ["teams", "matches", "quinielas"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        if (row.tournamentCode === undefined) {
          await ctx.db.patch(row._id, { tournamentCode: "WC" });
          patched++;
        }
      }
    }
    return { patched };
  },
});

// Limpieza puntual post-aislamiento (SEN-16): antes del scoping por torneo,
// joinQuiniela/redistributeAndLock repartían del pool GLOBAL de equipos, así que
// quinielas del Mundial recibieron clubes de liga (p. ej. PL). Esas filas rompen
// las vistas scoped (getOverview: el equipo foráneo no está en la resolución de
// la quiniela → crash). Borra cada ownership cuyo equipo es de OTRO torneo que
// su quiniela; equipos legacy sin tournamentCode normalizan a WC y se conservan.
// Filas con team/quiniela faltante se saltan. Idempotente: la segunda corrida borra 0.
// Ejecutar: npx convex run migrations:cleanupForeignOwnerships (dev);
// con --prod como red de seguridad (esperado: 0).
// Limpieza puntual (jun-2026): computeTeamStates eliminaba a clasificados cuando la
// fase de grupos terminaba con el bracket de 16vos a medio sembrar, y detectFromSync
// emitió avisos "X quedó eliminado" (y "Quedaste fuera") falsos. Tras corregir la
// lógica, este barrido borra SOLO los avisos erróneos: team_eliminated de equipos que
// SÍ clasificaron (tabla: 1º/2º + 8 mejores terceros) y disqualified de participantes
// que tienen al menos un clasificado. Conserva los de equipos realmente fuera.
// Idempotente. Ejecutar: npx convex run migrations:cleanupWrongEliminationNotifications --prod
export const cleanupWrongEliminationNotifications = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Alcance WC (incluye filas legacy sin tournamentCode).
    const isWc = (code: string | undefined) => (code ?? "WC") === "WC";
    const teams = (await ctx.db.query("teams").collect()).filter((t) => isWc(t.tournamentCode));
    const matches = (await ctx.db.query("matches").collect()).filter((m) => isWc(m.tournamentCode));

    const qualifiers = computeQualifiers(
      teams.map((t) => ({ _id: t._id, group: t.group })) as TeamRow[],
      matches.map((mt) => ({
        _id: mt._id, stage: mt.stage, group: mt.group,
        homeTeamId: mt.homeTeamId ?? null, awayTeamId: mt.awayTeamId ?? null,
        homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
        status: mt.status, winnerTeamId: mt.winnerTeamId ?? null, kickoffAt: mt.kickoffAt,
      })) as MatchRow[],
    );

    let teamEliminated = 0;
    let disqualified = 0;
    const notifs = await ctx.db.query("notifications").collect();
    for (const n of notifs) {
      if (n.type === "team_eliminated" && n.teamId && qualifiers.has(n.teamId)) {
        await ctx.db.delete(n._id);
        teamEliminated++;
      } else if (n.type === "disqualified" && n.participantId) {
        const owned = await ctx.db
          .query("ownerships")
          .withIndex("by_quiniela_participant", (q) =>
            q.eq("quinielaId", n.quinielaId).eq("participantId", n.participantId!),
          )
          .collect();
        if (owned.some((o) => qualifiers.has(o.teamId))) {
          await ctx.db.delete(n._id);
          disqualified++;
        }
      }
    }
    return { teamEliminated, disqualified };
  },
});

export const cleanupForeignOwnerships = internalMutation({
  args: {},
  handler: async (ctx) => {
    let deleted = 0;
    const rows = await ctx.db.query("ownerships").collect();
    for (const o of rows) {
      const team = await ctx.db.get(o.teamId);
      const quiniela = await ctx.db.get(o.quinielaId);
      if (!team || !quiniela) continue;
      if (tournamentCodeOf(team) !== tournamentCodeOf(quiniela)) {
        await ctx.db.delete(o._id);
        deleted++;
      }
    }
    return { deleted };
  },
});
