// Validadores Convex de la alineación almacenada. Compartidos por schema.ts
// (definición de tabla) y lineups.ts (args de upsertLineup). El número/pos/grid
// son opcionales porque la API los omite hasta confirmar; null no es almacenable.
import { v } from "convex/values";

export const playerValidator = v.object({
  name: v.string(),
  number: v.optional(v.number()),
  pos: v.optional(v.string()),
  grid: v.optional(v.string()),
});

export const teamLineupValidator = v.object({
  name: v.string(),
  formation: v.string(),
  coach: v.string(),
  startXI: v.array(playerValidator),
  bench: v.array(playerValidator),
});
