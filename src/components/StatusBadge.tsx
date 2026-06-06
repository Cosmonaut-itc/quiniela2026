import type { PlayerStatus } from "@/../convex/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Festive status pill shared by the players table and the personal header.
 * champion → gold 🏆 · out → red "Fuera" · pending → muted ⏳ "En espera" · alive → green "Vivo".
 * `label` overrides the default text (e.g. "Vivo · 3 equipos").
 */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: PlayerStatus;
  label?: string;
  className?: string;
}) {
  if (status === "pending") {
    return (
      <Badge
        className={cn(
          "border-transparent bg-muted font-semibold text-muted-foreground",
          className,
        )}
      >
        ⏳ {label ?? "En espera"}
      </Badge>
    );
  }
  if (status === "champion") {
    return (
      <Badge
        className={cn(
          "gold-ring border-transparent bg-gold/15 font-semibold text-gold",
          className,
        )}
      >
        🏆 {label ?? "Campeón"}
      </Badge>
    );
  }
  if (status === "out") {
    return (
      <Badge
        className={cn(
          "border-transparent bg-eliminated/15 font-semibold text-eliminated",
          className,
        )}
      >
        {label ?? "Fuera"}
      </Badge>
    );
  }
  return (
    <Badge
      className={cn(
        "border-transparent bg-alive/15 font-semibold text-alive",
        className,
      )}
    >
      <span className="mr-0.5 inline-block size-1.5 rounded-full bg-alive" />
      {label ?? "Vivo"}
    </Badge>
  );
}
