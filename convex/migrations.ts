// convex/migrations.ts
import { internalMutation } from "./_generated/server";

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
