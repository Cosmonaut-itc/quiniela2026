import type { PersonalData } from "@/../convex/types";
import { Badge } from "@/components/ui/badge";
import { whenLabel } from "@shared/format";
import { cn } from "@/lib/utils";

/**
 * Identidad visual de un equipo: bandera emoji (selecciones) o escudo por URL
 * (clubes); decide por prefijo http. Único punto de render de `team.flag`.
 */
export function TeamFlag({ flag, name, className = "" }: { flag: string; name: string; className?: string }) {
  if (flag.startsWith("http"))
    return <img src={flag} alt={name} className={cn("inline-block size-5 shrink-0 object-contain", className)} />;
  return <span className={className}>{flag}</span>;
}

/**
 * A single team owned by the player: flag, name, group, and its alive/out
 * state, plus next-match and last-result lines. Eliminated teams are dimmed
 * and struck through.
 */
export function TeamCard({ t }: { t: PersonalData["teams"][number] }) {
  const out = !t.alive;
  return (
    <div
      className={cn(
        "grain relative rounded-2xl border border-border bg-card px-3.5 py-3 transition-colors",
        out && "opacity-45",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamFlag flag={t.team.flag} name={t.team.name} className="text-2xl leading-none" />
          <div className="min-w-0">
            <div
              className={cn(
                "truncate font-heading text-[0.95rem] font-bold leading-tight",
                out && "line-through",
              )}
            >
              {t.team.name}
            </div>
            <div className="text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
              Grupo {t.group}
            </div>
          </div>
        </div>
        {out ? (
          <Badge className="shrink-0 border-transparent bg-eliminated/15 font-semibold text-eliminated">
            Fuera
          </Badge>
        ) : (
          <Badge className="shrink-0 border-transparent bg-alive/15 font-semibold text-alive">
            <span className="mr-0.5 inline-block size-1.5 rounded-full bg-alive" />
            Vivo
          </Badge>
        )}
      </div>

      {t.nextMatch && (
        <p className="mt-2.5 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground/70">Próximo:</span> vs{" "}
          <TeamFlag flag={t.nextMatch.opponent.flag} name={t.nextMatch.opponent.name} /> {t.nextMatch.opponent.name} ·{" "}
          {whenLabel(t.nextMatch.kickoffAt)} ·{" "}
          <span className="text-foreground/70">de {t.nextMatch.opponentOwner}</span>
        </p>
      )}
      {t.lastResult && (
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground/70">Último:</span>{" "}
          {t.lastResult}
        </p>
      )}
    </div>
  );
}
