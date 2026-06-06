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
});
