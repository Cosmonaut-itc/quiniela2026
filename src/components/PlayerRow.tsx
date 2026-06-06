import type { OverviewData } from "@/../convex/types";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

/**
 * One row in the overview players table: owner avatar + name, their
 * alive/total team count, and a status pill. Eliminated players are dimmed and
 * struck through; the champion gets the gold treatment.
 */
export function PlayerRow({ p }: { p: OverviewData["players"][number] }) {
  const out = p.status === "out";
  const champ = p.status === "champion";
  const pending = p.status === "pending";

  return (
    <div
      className={cn(
        "grain relative flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 transition-colors",
        champ && "gold-ring border-gold/30",
        out && "opacity-45",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn("relative", champ && "gold-ring rounded-full")}>
          <Avatar name={p.name} url={p.photoUrl} size={38} />
        </div>
        <span
          className={cn(
            "truncate font-heading text-[0.95rem] font-semibold",
            out && "line-through",
          )}
        >
          {p.name}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {!pending && (
          <span className="flex items-baseline gap-0.5 tabular-nums">
            <span
              className={cn(
                "font-heading text-lg font-bold leading-none",
                champ ? "text-gold" : out ? "text-eliminated" : "text-alive",
              )}
            >
              {p.aliveCount}
            </span>
            <span className="text-xs text-muted-foreground">
              /{p.totalCount} vivos
            </span>
          </span>
        )}
        <StatusBadge status={p.status} />
      </div>
    </div>
  );
}
