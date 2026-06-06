// convex/quinielas.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { newToken } from "./lib/tokens";
import { computeSlotSizes, shuffleInPlace } from "./lib/distribution";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const createQuiniela = mutation({
  args: {
    name: v.string(),
    prizeText: v.string(),
    numParticipants: v.number(),
    photoId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const n = Math.max(1, Math.min(48, Math.floor(args.numParticipants)));
    const slotSizes = shuffleInPlace(computeSlotSizes(n, 48), Math.random);
    const adminToken = newToken();
    const joinToken = newToken();
    const quinielaId = await ctx.db.insert("quinielas", {
      name: args.name.trim().slice(0, 60),
      prizeText: args.prizeText.trim().slice(0, 60),
      numParticipants: n,
      slotSizes,
      adminToken,
      joinToken,
      status: "open",
      photoId: args.photoId,
      createdAt: Date.now(),
    });
    return { quinielaId, adminToken, joinToken };
  },
});
