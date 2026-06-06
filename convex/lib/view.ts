// convex/lib/view.ts
import type { Id } from "../_generated/dataModel";
import type { TeamLite } from "../types";

export function teamLite(
  t: { code: string; name: string; flag: string; group: string } | null | undefined,
): TeamLite | null {
  return t ? { code: t.code, name: t.name, flag: t.flag, group: t.group } : null;
}

export async function photoUrl(
  ctx: { storage: { getUrl(id: Id<"_storage">): Promise<string | null> } },
  id?: Id<"_storage"> | null,
): Promise<string | null> {
  return id ? await ctx.storage.getUrl(id) : null;
}
