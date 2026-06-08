// convex/lib/view.ts
import type { Id } from "../_generated/dataModel";
import type { TeamLite, PrizeMode, PrizeView, PlayerTeam } from "../types";

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

export function prizeModeOf(qn: { prizeMode?: string }): PrizeMode {
  return qn.prizeMode === "per_person" ? "per_person" : "fixed";
}

export function prizeView(
  qn: { prizeMode?: string; prizeText: string; entryFee?: number },
  contributors: number,
): PrizeView {
  if (prizeModeOf(qn) === "per_person") {
    const entryFee = qn.entryFee ?? 0;
    return { mode: "per_person", text: "", entryFee, pool: entryFee * contributors, contributors };
  }
  return { mode: "fixed", text: qn.prizeText, entryFee: null, pool: null, contributors };
}

/** Orden estable de los equipos de un jugador: vivos primero, luego grupo y nombre. */
export function sortPlayerTeams(teams: PlayerTeam[]): PlayerTeam[] {
  return [...teams].sort(
    (a, b) =>
      (b.alive ? 1 : 0) - (a.alive ? 1 : 0) ||
      a.team.group.localeCompare(b.team.group) ||
      a.team.name.localeCompare(b.team.name),
  );
}
