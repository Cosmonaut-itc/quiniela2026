import type { MundialData } from "@/../convex/types";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

/**
 * Group-stage standings. Each group is a mini table; the top two rows are
 * marked as advancing (green dot), eliminated teams are dimmed + struck through.
 * Each team carries its owner's avatar + name.
 */
export function GroupsView({
  groups,
  showOwners = true,
}: {
  groups: MundialData["groups"];
  showOwners?: boolean;
}) {
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div
          key={g.group}
          className="grain relative overflow-hidden rounded-2xl border border-border bg-card px-3.5 py-3"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="font-heading text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
              Grupo {g.group}
            </span>
            <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
              Pts
            </span>
          </div>

          {g.rows.map((r, i) => {
            const out = !r.alive;
            const advancing = !out && i < 2;
            return (
              <div
                key={r.team.code}
                className={cn(
                  "flex items-center justify-between gap-2 border-t border-border/60 py-1.5 first:border-t-0",
                  out && "opacity-40",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      advancing
                        ? "bg-alive"
                        : out
                          ? "bg-eliminated"
                          : "bg-muted-foreground/40",
                    )}
                  />
                  <span className="text-lg leading-none">{r.team.flag}</span>
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      out && "line-through",
                    )}
                  >
                    {r.team.name}
                  </span>
                  {showOwners && (
                    <>
                      <Avatar
                        name={r.ownerName}
                        url={r.ownerPhotoUrl}
                        size={18}
                      />
                      <span className="max-w-16 truncate text-[0.7rem] text-muted-foreground">
                        {r.ownerName}
                      </span>
                    </>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 font-heading text-sm font-bold tabular-nums",
                    advancing ? "text-alive" : "text-foreground/80",
                  )}
                >
                  {r.points}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      <p className="pt-1 text-center text-[0.7rem] text-muted-foreground">
        <span className="text-alive">●</span> clasifica ·{" "}
        <span className="text-eliminated">●</span> eliminado
      </p>
    </div>
  );
}
