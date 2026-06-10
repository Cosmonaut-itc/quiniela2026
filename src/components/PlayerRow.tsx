import type { OverviewData } from "@/../convex/types";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { TeamFlag } from "@/components/TeamCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Player = OverviewData["players"][number];

/** Un equipo dentro de la carta expandida: bandera + nombre + pastilla vivo/fuera. */
function PlayerTeamRow({ t }: { t: Player["teams"][number] }) {
  const out = !t.alive;
  return (
    <li className={cn("flex items-center justify-between gap-2", out && "opacity-45")}>
      <span className="flex min-w-0 items-center gap-2">
        <TeamFlag flag={t.team.flag} name={t.team.name} className="text-lg leading-none" />
        <span className={cn("truncate text-sm", out && "line-through")}>
          {t.team.name}
        </span>
      </span>
      <Badge
        className={cn(
          "shrink-0 border-transparent font-semibold",
          out ? "bg-eliminated/15 text-eliminated" : "bg-alive/15 text-alive",
        )}
      >
        {out ? (
          "Fuera"
        ) : (
          <>
            <span className="mr-0.5 inline-block size-1.5 rounded-full bg-alive" />
            Vivo
          </>
        )}
      </Badge>
    </li>
  );
}

/** Avatar + nombre a la izquierda; conteo de vivos + estado (+ chevron) a la derecha. */
function PlayerSummary({ p, expandable }: { p: Player; expandable: boolean }) {
  const out = p.status === "out";
  const champ = p.status === "champion";
  const pending = p.status === "pending";
  return (
    <div className="flex w-full items-center justify-between gap-3">
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
        {expandable && (
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]:rotate-180"
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

/**
 * Una fila de la tabla de jugadores. Tocar una carta con equipos la expande y
 * revela los equipos del jugador (bandera + nombre + vivo/fuera). Los jugadores
 * sin equipos (p. ej. antes de un sorteo on_reveal) se renderizan como carta
 * estática no expandible. Eliminados atenuados y tachados; el campeón en dorado.
 */
export function PlayerRow({ p }: { p: Player }) {
  const out = p.status === "out";
  const champ = p.status === "champion";
  const expandable = p.teams.length > 0;

  const cardClass = cn(
    "grain relative overflow-hidden rounded-2xl border border-border bg-card transition-colors",
    champ && "gold-ring border-gold/30",
    out && "opacity-45",
  );

  if (!expandable) {
    return (
      <div className={cn(cardClass, "px-3.5 py-3")}>
        <PlayerSummary p={p} expandable={false} />
      </div>
    );
  }

  return (
    <Collapsible defaultOpen={false} className={cardClass}>
      <CollapsibleTrigger className="group w-full px-3.5 py-3 text-left transition-colors hover:bg-secondary/40">
        <PlayerSummary p={p} expandable />
      </CollapsibleTrigger>
      <CollapsiblePanel className="border-t border-border px-3.5 py-2.5">
        <ul className="space-y-1.5">
          {p.teams.map((t) => (
            <PlayerTeamRow key={t.team.code} t={t} />
          ))}
        </ul>
      </CollapsiblePanel>
    </Collapsible>
  );
}
