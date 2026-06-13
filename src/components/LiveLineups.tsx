import type { LiveMatchLineupView, TeamLineupView } from "@/../convex/types";
import { TeamFlag } from "@/components/TeamCard";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/** Sección "En vivo" de la Vista Torneo: una tarjeta por partido jugándose ahora.
 *  Presentacional: la ruta inyecta `matches` desde getLiveLineups. */
export function LiveLineups({ matches }: { matches: LiveMatchLineupView[] }) {
  if (matches.length === 0) return null;
  return (
    <section className="mb-5">
      <h2 className="mb-2 flex items-center gap-1.5 font-heading text-sm font-bold tracking-wide text-muted-foreground uppercase">
        <span className="inline-block size-2 animate-pulse rounded-full bg-eliminated" /> En vivo
      </h2>
      <div className="space-y-2">
        {matches.map((m) => (
          <Dialog key={m.matchId}>
            <DialogTrigger
              render={
                <button className="grain relative w-full overflow-hidden rounded-2xl border border-border bg-card px-3.5 py-3 text-left" />
              }
            >
              <MatchHeader m={m} />
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {m.home?.name ?? "—"} vs {m.away?.name ?? "—"}
                </DialogTitle>
              </DialogHeader>
              <LineupSheet match={m} />
            </DialogContent>
          </Dialog>
        ))}
      </div>
    </section>
  );
}

function MatchHeader({ m }: { m: LiveMatchLineupView }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {m.home && <TeamFlag flag={m.home.flag} name={m.home.name} className="text-lg leading-none" />}
        <span className="truncate text-sm font-medium">{m.home?.name ?? "—"}</span>
      </span>
      <span className="font-heading text-sm font-bold tabular-nums">{m.homeScore ?? 0}–{m.awayScore ?? 0}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
        <span className="truncate text-sm font-medium">{m.away?.name ?? "—"}</span>
        {m.away && <TeamFlag flag={m.away.flag} name={m.away.name} className="text-lg leading-none" />}
      </span>
    </div>
  );
}

/** Contenido del sheet: dos columnas con formación, DT, 11 y banca. */
export function LineupSheet({ match }: { match: LiveMatchLineupView }) {
  if (!match.lineup) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Alineación por confirmar</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-4">
      <TeamColumn name={match.home?.name ?? "Local"} lineup={match.lineup.home} />
      <TeamColumn name={match.away?.name ?? "Visita"} lineup={match.lineup.away} />
    </div>
  );
}

function TeamColumn({ name, lineup }: { name: string; lineup: TeamLineupView }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-heading text-sm font-bold">{name}</p>
      <p className="text-[0.7rem] text-muted-foreground">
        {lineup.formation || "—"}{lineup.coach && ` · DT ${lineup.coach}`}
      </p>
      <ul className="mt-2 space-y-0.5">
        {lineup.startXI.map((p, i) => (
          <li key={`xi-${i}`} className="flex gap-1.5 text-xs">
            <span className="w-5 shrink-0 tabular-nums text-muted-foreground">{p.number ?? ""}</span>
            <span className="truncate">{p.name}</span>
          </li>
        ))}
      </ul>
      {lineup.bench.length > 0 && (
        <>
          <p className="mt-2 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">Banca</p>
          <ul className="mt-1 space-y-0.5">
            {lineup.bench.map((p, i) => (
              <li key={`b-${i}`} className="flex gap-1.5 text-xs text-muted-foreground">
                <span className="w-5 shrink-0 tabular-nums">{p.number ?? ""}</span>
                <span className="truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
