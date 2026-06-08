import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  teams: defineTable({
    code: v.string(),
    name: v.string(),
    flag: v.string(),
    group: v.string(),
    alive: v.boolean(),
    currentStage: v.string(), // "group" | "r32" | "r16" | "qf" | "sf" | "final" | "champion" | "out"
    eliminatedAt: v.optional(v.number()),
    externalId: v.string(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_group", ["group"]),

  matches: defineTable({
    stage: v.string(),
    group: v.optional(v.string()),
    homeTeamId: v.optional(v.id("teams")),
    awayTeamId: v.optional(v.id("teams")),
    kickoffAt: v.number(),
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
    status: v.string(), // "scheduled" | "live" | "finished"
    winnerTeamId: v.optional(v.id("teams")),
    externalId: v.string(),
    // DEPRECADO: las correcciones son por quiniela (matchOverrides); el global
    // siempre sigue la API. Opcional para tolerar filas viejas; se suelta en limpieza futura.
    manualOverride: v.optional(v.boolean()),
    bracketSlot: v.optional(v.string()),
  })
    .index("by_externalId", ["externalId"])
    .index("by_stage_kickoff", ["stage", "kickoffAt"])
    .index("by_kickoff", ["kickoffAt"]),

  quinielas: defineTable({
    name: v.string(),
    photoId: v.optional(v.id("_storage")),
    prizeText: v.string(),
    prizeMode: v.optional(v.string()), // "fixed" | "per_person"; ausente = "fixed" (legacy)
    entryFee: v.optional(v.number()),  // solo per_person; entero >= 1 (pesos)
    notes: v.optional(v.string()), // texto libre del admin; ausente/"" = sin notas
    numParticipants: v.number(),
    slotSizes: v.array(v.number()),
    adminToken: v.string(),
    joinToken: v.string(),
    status: v.string(), // "open" | "locked" | "finished"
    assignMode: v.optional(v.string()), // "on_join" | "on_reveal"; missing = on_join (legacy)
    championParticipantId: v.optional(v.id("participants")),
    lockedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_adminToken", ["adminToken"])
    .index("by_joinToken", ["joinToken"])
    .index("by_status", ["status"]),

  participants: defineTable({
    quinielaId: v.id("quinielas"),
    name: v.string(),
    photoId: v.optional(v.id("_storage")),
    personalToken: v.string(),
    slotIndex: v.number(),
    joinedAt: v.number(),
    paid: v.optional(v.boolean()), // solo relevante en per_person; ausente = no pagó
    paymentMethod: v.optional(
      v.union(v.literal("efectivo"), v.literal("transferencia")),
    ), // solo si paid; ausente = sin clasificar (incluye filas legacy)
  })
    .index("by_personalToken", ["personalToken"])
    .index("by_quiniela", ["quinielaId"]),

  ownerships: defineTable({
    quinielaId: v.id("quinielas"),
    teamId: v.id("teams"),
    participantId: v.id("participants"),
  })
    .index("by_quiniela_team", ["quinielaId", "teamId"])
    .index("by_quiniela_participant", ["quinielaId", "participantId"])
    .index("by_quiniela", ["quinielaId"]),

  // Corrección manual de marcador POR QUINIELA. La presencia de una fila = ese
  // partido está corregido a mano en esa quiniela; se superpone al resultado
  // global (API) solo para esa quiniela. El `matches` global nunca se toca.
  // Invariante: una sola fila por (quinielaId, matchId) — garantizada por el upsert
  // de setMatchResultManual (busca por by_quiniela_match y hace patch o insert).
  matchOverrides: defineTable({
    quinielaId: v.id("quinielas"),
    matchId: v.id("matches"),
    homeScore: v.number(),
    awayScore: v.number(),
    status: v.string(), // "finished" | "live"
    winnerTeamId: v.optional(v.id("teams")),
  })
    .index("by_quiniela", ["quinielaId"])
    .index("by_quiniela_match", ["quinielaId", "matchId"]),

  // Avisos persistidos (in-app; en Fase 2 también disparan push). Una fila por aviso.
  // `dedupeKey` garantiza emite-una-vez: la detección por cron solo inserta si no existe.
  notifications: defineTable({
    quinielaId: v.id("quinielas"),
    audience: v.string(), // "participant" | "admin"
    participantId: v.optional(v.id("participants")),
    type: v.string(),
    title: v.string(),
    body: v.string(),
    matchId: v.optional(v.id("matches")),
    teamId: v.optional(v.id("teams")),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
    dedupeKey: v.string(),
  })
    .index("by_participant", ["participantId", "createdAt"])
    .index("by_quiniela_audience", ["quinielaId", "audience", "createdAt"])
    .index("by_dedupe", ["dedupeKey"]),

  // Suscripción de Web Push (anónima del navegador), atada a un participante o al admin.
  pushSubscriptions: defineTable({
    quinielaId: v.id("quinielas"),
    audience: v.string(), // "participant" | "admin"
    participantId: v.optional(v.id("participants")),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
  })
    .index("by_participant", ["participantId"])
    .index("by_quiniela_audience", ["quinielaId", "audience"])
    .index("by_endpoint", ["endpoint"]),
});
