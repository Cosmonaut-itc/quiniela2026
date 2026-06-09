import type { ProgolMatchView, Pick } from "@/../convex/types";
import { PickSelector } from "@/components/PickSelector";
import { whenLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const PICK_LABEL: Record<Pick, string> = { home: "Local", draw: "Empate", away: "Visita" };

/** Una fila de partido: marcador/fecha arriba y el control/resultado abajo según el estado. */
export function PredictMatchRow({
  m, editable, onPick,
}: {
  m: ProgolMatchView;
  editable: boolean;
  onPick?: (matchId: string, pick: Pick) => void;
}) {
  const homeCode = m.home?.code ?? "—";
  const awayCode = m.away?.code ?? "—";
  return (
    <div className="grain relative overflow-hidden rounded-2xl border border-border bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="text-lg leading-none">{m.home?.flag ?? "❔"}</span>
          <span className="truncate text-sm font-medium">{homeCode}</span>
        </span>
        {m.state === "finished" ? (
          <span className="font-heading text-sm font-bold tabular-nums">{m.homeScore}–{m.awayScore}</span>
        ) : (
          <span className="text-[0.65rem] text-muted-foreground">{whenLabel(m.kickoffAt)}</span>
        )}
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
          <span className="truncate text-sm font-medium">{awayCode}</span>
          <span className="text-lg leading-none">{m.away?.flag ?? "❔"}</span>
        </span>
      </div>

      <div className="mt-2.5">
        {m.state === "pending" ? (
          <p className="text-center text-[0.7rem] text-muted-foreground italic">Rival por definir</p>
        ) : m.state === "finished" ? (
          <ResultLine m={m} />
        ) : (
          <PickSelector
            value={m.pick}
            disabled={!editable || m.state === "locked"}
            onPick={(p) => onPick?.(m.matchId, p)}
            options={{ home: homeCode, away: awayCode }}
          />
        )}
        {m.state === "locked" && (
          <p className="mt-1 text-center text-[0.65rem] text-muted-foreground">
            {m.pick ? `Tu pronóstico: ${PICK_LABEL[m.pick]}` : "Sin pronóstico · partido cerrado"}
          </p>
        )}
      </div>
    </div>
  );
}

function ResultLine({ m }: { m: ProgolMatchView }) {
  // Defensivo: un partido "finished" debería traer siempre resultado (marcador),
  // pero el tipo no lo garantiza; si faltara, mostramos el pick sin veredicto en
  // vez de reventar con un acceso a PICK_LABEL[null].
  if (m.result == null) {
    return (
      <p className="text-center text-[0.7rem] text-muted-foreground">
        {m.pick == null ? "Sin resultado" : `Tu pronóstico: ${PICK_LABEL[m.pick]}`}
      </p>
    );
  }
  if (m.pick == null) {
    return <p className="text-center text-[0.7rem] text-muted-foreground">No pronosticaste · resultado: {PICK_LABEL[m.result]}</p>;
  }
  return (
    <p className={cn("text-center text-[0.7rem] font-semibold", m.correct ? "text-alive" : "text-eliminated")}>
      {m.correct ? "✓ Acertaste" : "✗ Fallaste"} · tu {PICK_LABEL[m.pick]}
    </p>
  );
}
