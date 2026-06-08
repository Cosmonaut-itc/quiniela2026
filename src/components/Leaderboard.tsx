import type { ProgolLeaderRow } from "@/../convex/types";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

/** Tabla de posiciones del modo progol. Tocar una fila abre la tarjeta del jugador. */
export function Leaderboard({
  rows, onSelect,
}: {
  rows: ProgolLeaderRow[];
  onSelect?: (participantId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
        Aún no hay jugadores.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <button
          key={r.participantId}
          type="button"
          onClick={() => onSelect?.(r.participantId)}
          className="grain relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/40"
        >
          <span className={cn("w-6 shrink-0 text-center font-heading text-sm font-bold tabular-nums", r.rank === 1 ? "text-gold" : "text-muted-foreground")}>
            {r.rank}
          </span>
          <Avatar name={r.name} url={r.photoUrl} size={34} />
          <span className="min-w-0 flex-1 truncate font-heading text-sm font-semibold">{r.name}</span>
          <span className="shrink-0 text-right">
            <span className="font-heading text-base font-bold tabular-nums text-foreground">{r.points}</span>
            <span className="ml-1 text-[0.7rem] text-muted-foreground">pts</span>
            <span className="block text-[0.65rem] text-muted-foreground">{r.correct}/{r.played} aciertos</span>
          </span>
        </button>
      ))}
    </div>
  );
}
