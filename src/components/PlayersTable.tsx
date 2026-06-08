import type { OverviewData } from "@/../convex/types";
import { ChevronDown } from "lucide-react";
import { PlayerRow } from "@/components/PlayerRow";
import { EmptyTile } from "@/components/bits";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from "@/components/ui/collapsible";

/**
 * Sección colapsable "Tabla de jugadores". Arranca expandida; tocar el encabezado
 * colapsa toda la lista para ahorrar espacio. Cada carta se expande por su cuenta
 * para mostrar los equipos de ese jugador (ver PlayerRow).
 */
export function PlayersTable({
  players,
  freeSlots,
}: {
  players: OverviewData["players"];
  freeSlots: number;
}) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger
        render={<button type="button" />}
        className="group mt-6 mb-2.5 flex w-full items-center justify-between gap-2 px-1 text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground uppercase"
      >
        <span>Tabla de jugadores · {players.length}</span>
        <ChevronDown
          className="size-3.5 shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="space-y-2.5">
          {players.length === 0 ? (
            <EmptyTile>Aún no se inscribe nadie. ¡Sé el primero!</EmptyTile>
          ) : (
            players.map((p) => <PlayerRow key={p.participantId} p={p} />)
          )}
          {freeSlots > 0 && (
            <EmptyTile>
              ＋ {freeSlots} {freeSlots === 1 ? "lugar libre" : "lugares libres"} ·
              esperando jugador
            </EmptyTile>
          )}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
