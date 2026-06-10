// convex/migrations.ts
import { internalMutation } from "./_generated/server";
import { tournamentCodeOf } from "./lib/tournaments";

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
