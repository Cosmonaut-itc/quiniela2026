import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { Pick } from "@/../convex/types";
import { EditableAvatar } from "@/components/EditableAvatar";
import { NotificationBell } from "@/components/NotificationBell";
import { PushOptIn } from "@/components/PushOptIn";
import { Shell, BottomNav } from "@/components/Shell";
import { PrizeBanner } from "@/components/bits";
import { PredictMatchRow } from "@/components/PredictMatchRow";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { prizeBanner } from "@shared/format";

function LoadingState() {
  return (
    <Shell>
      <Skeleton className="h-14 w-full rounded-2xl" />
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    </Shell>
  );
}

export function ProgolPersonal({ id, personalToken }: { id: string; personalToken: string }) {
  const data = useQuery(api.progol.getPersonal, { personalToken });
  const mode = useQuery(api.quinielas.getMode, { id: id as Id<"quinielas"> });
  const predict = useMutation(api.progol.predict);
  // Ronda elegida por el usuario; null = aterrizar en la ronda en curso
  // (estado derivado de currentRonda, sin setState en effects — regla del repo).
  const [ronda, setRonda] = useState<string | null>(null);

  if (data === undefined || mode === undefined) return <LoadingState />;
  const { who } = data;

  const isLiga = mode?.tournament.format === "liga";
  const labels = data.stages.map((s) => s.label);
  const activeRonda = ronda ?? data.currentRonda;
  const idxRaw = activeRonda ? labels.indexOf(activeRonda) : -1;
  const idx = idxRaw === -1 ? 0 : idxRaw;
  // En liga se muestra UNA jornada a la vez con navegación ◀▶; en eliminatorio,
  // todas las etapas en lista como siempre.
  const visibleStages = isLiga ? data.stages.slice(idx, idx + 1) : data.stages;

  async function onPick(matchId: string, pick: Pick) {
    try {
      await predict({ personalToken, matchId: matchId as Id<"matches">, pick });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el pronóstico");
    }
  }

  return (
    <Shell bottomNav={<BottomNav id={id} active="me" meToken={personalToken} joinToken={data.joinToken} tournament={mode?.tournament} />}>
      <header className="grain bg-pitch header-safe relative -mx-4 overflow-hidden rounded-b-3xl border-b border-border px-4 pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <EditableAvatar name={who.name} url={who.photoUrl} size={48} personalToken={personalToken} />
            <div className="min-w-0">
              <h1 className="truncate font-heading text-2xl font-extrabold tracking-tight">{who.name}</h1>
              <p className="truncate text-sm text-muted-foreground">{data.quinielaName}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start">
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-center font-heading text-xs font-bold text-primary">
              #{who.rank} · {who.points} pts
            </span>
            <NotificationBell quinielaId={id} token={personalToken} kind="me" />
          </div>
        </div>
        {(() => { const b = prizeBanner(data.prize, data.status, " al líder"); return b ? <PrizeBanner title={b.title} subline={b.subline} /> : null; })()}
      </header>

      <PushOptIn personalToken={personalToken} />

      <div className="mt-2 space-y-5">
        {isLiga && labels.length > 0 && (
          <div className="flex items-center justify-between">
            <Button
              variant="ghost" size="icon" aria-label="Jornada anterior"
              disabled={idx === 0} onClick={() => setRonda(labels[idx - 1])}
            >
              <ChevronLeft />
            </Button>
            <h2 className="font-heading text-lg font-bold">{labels[idx]}</h2>
            <Button
              variant="ghost" size="icon" aria-label="Jornada siguiente"
              disabled={idx === labels.length - 1} onClick={() => setRonda(labels[idx + 1])}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
        {visibleStages.map((s) => (
          <div key={s.stage}>
            {!isLiga && (
              <div className="mb-2 px-1 text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">{s.label}</div>
            )}
            <div className="space-y-2.5">
              {s.matches.map((m) => <PredictMatchRow key={m.matchId} m={m} editable onPick={onPick} />)}
            </div>
          </div>
        ))}
      </div>

      <Link to={`/q/${id}/torneo`} className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold transition-colors hover:bg-secondary">
        <span className="flex items-center gap-2"><span className="text-lg">🌍</span> {isLiga ? "Ver tabla de posiciones del torneo" : "Ver grupos y bracket del Mundial"}</span>
        <span className="text-muted-foreground">→</span>
      </Link>
    </Shell>
  );
}
