// convex/sync.ts
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { fetchMatches } from "./lib/footballData";

// The Convex runtime exposes deployment env vars on process.env; declare it
// narrowly so the V8-runtime tsconfig (no "node" types) typechecks without
// pulling all of Node's globals into scope.
declare const process: { env: Record<string, string | undefined> };

export const syncMatches = internalAction({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; error?: string }> => {
    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) return { ok: false, error: "missing FOOTBALL_DATA_TOKEN" };
    try {
      const matches = await fetchMatches(token);
      for (const match of matches) {
        await ctx.runMutation(internal.matches.upsertMatchResult, { match });
      }
      await ctx.runMutation(internal.matches.recomputeTeamStates, {});
      await ctx.runMutation(internal.quinielas.autoCloseDue, {});
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  },
});
