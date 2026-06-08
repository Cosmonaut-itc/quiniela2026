import type { Pick } from "@/../convex/types";
import { cn } from "@/lib/utils";

/** Control segmentado 1/X/2 (mismo patrón que el "Ganador" del admin clásico). */
export function PickSelector({
  value, onPick, disabled, options,
}: {
  value: Pick | null;
  onPick: (p: Pick) => void;
  disabled?: boolean;
  options: { home: string; away: string };
}) {
  const items: [Pick, string][] = [["home", options.home], ["draw", "Empate"], ["away", options.away]];
  return (
    <div className="flex items-center gap-1.5">
      {items.map(([key, lbl]) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onPick(key)}
            aria-pressed={active}
            aria-label={`Pronóstico ${lbl}`}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition disabled:opacity-60",
              active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );
}
