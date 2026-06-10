import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import { persistToken, readStoredToken } from "@/lib/storage";
import { Shell, BottomNav } from "@/components/Shell";
import { SectionHeading, PrizeBanner } from "@/components/bits";
import { Leaderboard } from "@/components/Leaderboard";
import { PredictMatchRow } from "@/components/PredictMatchRow";
import { prizeBanner } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

function LoadingState() {
  return (
    <Shell>
      <Skeleton className="h-14 w-full rounded-2xl" />
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}
      </div>
    </Shell>
  );
}

export function ProgolGeneral({ id, joinToken }: { id: string; joinToken: string }) {
  const data = useQuery(api.progol.getGeneral, { joinToken });
  const mode = useQuery(api.quinielas.getMode, { id: id as Id<"quinielas"> });
  const join = useMutation(api.participants.joinQuiniela);
  const { upload, uploading } = usePhotoUpload();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  if (data === undefined) return <LoadingState />;
  const { quiniela } = data;
  const alreadyJoined = !!readStoredToken(id, "me");
  const canJoin = quiniela.status === "open";
  const statusLabel = quiniela.status === "open" ? "Inscripciones abiertas"
    : quiniela.status === "locked" ? "Inscripciones cerradas" : "Mundial finalizado";

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const photoId = file ? await upload(file) : undefined;
      const res = await join({ joinToken, name, photoId: photoId as Id<"_storage"> | undefined });
      persistToken(id, "me", res.personalToken);
      nav(`/q/${id}/me/${res.personalToken}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell bottomNav={<BottomNav id={id} active="general" joinToken={joinToken} tournament={mode?.tournament} />}>
      <header className="grain bg-pitch header-safe relative -mx-4 overflow-hidden rounded-b-3xl border-b border-border px-4 pb-6">
        <div className="flex items-center gap-3.5">
          {quiniela.photoUrl ? (
            <img src={quiniela.photoUrl} alt="" className="size-14 shrink-0 rounded-2xl object-cover ring-1 ring-border" />
          ) : (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-3xl ring-1 ring-border">🎯</div>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-extrabold tracking-tight">{quiniela.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {quiniela.filledCount} {quiniela.filledCount === 1 ? "jugador" : "jugadores"} · <span className="text-foreground/70">{statusLabel}</span>
            </p>
          </div>
        </div>
        {(() => { const b = prizeBanner(quiniela.prize, quiniela.status, " al líder"); return b ? <PrizeBanner title={b.title} subline={b.subline} /> : null; })()}
      </header>

      {quiniela.notes && (
        <>
          <SectionHeading>Notas</SectionHeading>
          <div className="grain relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-3 text-sm whitespace-pre-wrap text-foreground/90">
            {quiniela.notes}
          </div>
        </>
      )}

      <SectionHeading>
        Tabla de posiciones
        <span className="ml-1.5 font-medium text-foreground/40">{data.decidedMatches} jugados</span>
      </SectionHeading>
      <Leaderboard rows={data.leaderboard} onSelect={setViewing} />

      <Link to={`/q/${id}/torneo`} className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold transition-colors hover:bg-secondary">
        <span className="flex items-center gap-2"><span className="text-lg">🌍</span> {mode?.tournament.format === "liga" ? "Ver tabla de posiciones del torneo" : "Ver grupos y bracket del Mundial"}</span>
        <span className="text-muted-foreground">→</span>
      </Link>

      {!alreadyJoined && (canJoin ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="lg" className="glow-primary mt-6 h-12 w-full rounded-2xl text-base font-bold" />}>
            🎯 Unirme a la quiniela
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Unirte a {quiniela.name}</DialogTitle>
              <DialogDescription>Pronostica cada partido. ¡Gana quien más acierte!</DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="join-name">Tu nombre</Label>
                <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. María" maxLength={40} autoFocus />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="join-photo">Foto (opcional)</Label>
                <Input id="join-photo" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <Button type="submit" size="lg" className="h-11 rounded-xl font-bold" disabled={busy || uploading || !name.trim()}>
                {busy || uploading ? "Entrando…" : "Confirmar inscripción"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : (
        <div className="mt-6 rounded-2xl border border-border bg-card px-4 py-3.5 text-center text-sm text-muted-foreground">
          Las inscripciones ya están cerradas.
        </div>
      ))}

      <ViewCardDialog joinToken={joinToken} participantId={viewing} onClose={() => setViewing(null)} />
    </Shell>
  );
}

/** Tarjeta read-only de otro jugador (pronósticos siempre visibles). */
function ViewCardDialog({ joinToken, participantId, onClose }: { joinToken: string; participantId: string | null; onClose: () => void }) {
  const card = useQuery(api.progol.getCard, participantId ? { joinToken, participantId: participantId as Id<"participants"> } : "skip");
  return (
    <Dialog open={!!participantId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card?.who.name ?? "Pronósticos"}</DialogTitle>
          <DialogDescription>{card ? `Lugar #${card.who.rank} · ${card.who.points} pts` : "Cargando…"}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {card?.stages.map((s) => {
            const shown = s.matches.filter((m) => m.state !== "pending");
            if (shown.length === 0) return null;
            return (
              <div key={s.stage}>
                <div className="mb-1.5 text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">{s.label}</div>
                <div className="space-y-2">{shown.map((m) => <PredictMatchRow key={m.matchId} m={m} editable={false} />)}</div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
