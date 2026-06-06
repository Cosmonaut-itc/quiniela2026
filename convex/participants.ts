// convex/participants.ts  (getPersonalPanel added later in Task 3.2)
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { newToken } from "./lib/tokens";
import { drawN } from "./lib/distribution";

export const joinQuiniela = mutation({
  args: { joinToken: v.string(), name: v.string(), photoId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    if (qn.status !== "open") throw new Error("Las inscripciones están cerradas");

    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const k = participants.length;
    if (k >= qn.numParticipants) throw new Error("Ya no hay lugares disponibles");

    const size = qn.slotSizes[k];

    // pool = teams not yet owned in this quiniela
    const owned = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownedSet = new Set(owned.map((o) => o.teamId));
    const allTeams = await ctx.db.query("teams").collect();
    const pool = allTeams.filter((tm) => !ownedSet.has(tm._id)).map((tm) => tm._id);

    const { picked } = drawN(pool, size, Math.random);

    const personalToken = newToken();
    const participantId = await ctx.db.insert("participants", {
      quinielaId: qn._id, name: args.name.trim().slice(0, 40),
      photoId: args.photoId, personalToken, slotIndex: k, joinedAt: Date.now(),
    });
    for (const teamId of picked) {
      await ctx.db.insert("ownerships", { quinielaId: qn._id, teamId, participantId });
    }
    return { personalToken };
  },
});
