import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import { readStoredToken, persistToken } from "@/lib/storage";
import { PlayersTable } from "@/components/PlayersTable";
import { DuelRow } from "@/components/DuelRow";
import { Shell, BottomNav } from "@/components/Shell";
import { SectionHeading, PrizeBanner } from "@/components/bits";
import { prizeBanner } from "@shared/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProgolGeneral } from "@/routes/progol/ProgolGeneral";

function LoadingState() {
  return (
    <Shell>
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="mt-4 h-12 rounded-2xl" />
      <div className="mt-8 space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </Shell>
  );
}

export default function Join() {
  const { id, token } = useParams();
  const mode = useQuery(api.quinielas.getMode, { id: id as Id<"quinielas"> });
  const data = useQuery(
    api.quinielas.getOverview,
    mode?.gameMode === "clasica" ? { joinToken: token! } : "skip",
  );
  const join = useMutation(api.participants.joinQuiniela);
  const { upload, uploading } = usePhotoUpload();
  const nav = useNavigate();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (mode === undefined) return <LoadingState />;
  if (mode.gameMode === "progol") return <ProgolGeneral id={id!} joinToken={token!} />;
  if (data === undefined) return <LoadingState />;

  const { quiniela } = data;
  const canJoin = quiniela.status === "open" && data.freeSlots > 0;

  // "Ya inscrito en este dispositivo" = existe el token de participante en localStorage.
  const alreadyJoined = !!id && !!readStoredToken(id, "me");

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const photoId = file ? await upload(file) : undefined;
      const res = await join({
        joinToken: token!,
        name,
        photoId: photoId as Id<"_storage"> | undefined,
      });
      persistToken(id!, "me", res.personalToken);
      nav(`/q/${id}/me/${res.personalToken}`);
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    quiniela.status === "open"
      ? "Inscripciones abiertas"
      : quiniela.status === "locked"
        ? "Inscripciones cerradas"
        : "Mundial finalizado";

  return (
    <Shell
      bottomNav={
        <BottomNav id={id!} active="general" joinToken={token} tournament={mode?.tournament} />
      }
    >
      {/* Header */}
      <header className="grain bg-pitch header-safe relative -mx-4 overflow-hidden rounded-b-3xl border-b border-border px-4 pb-6">
        <div className="flex items-center gap-3.5">
          {quiniela.photoUrl ? (
            <img
              src={quiniela.photoUrl}
              alt=""
              className="size-14 shrink-0 rounded-2xl object-cover ring-1 ring-border"
            />
          ) : (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-3xl ring-1 ring-border">
              🏟️
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-extrabold tracking-tight">
              {quiniela.name}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {quiniela.filledCount} de {quiniela.numParticipants} lugares ·{" "}
              <span className="text-foreground/70">{statusLabel}</span>
            </p>
          </div>
        </div>
        {(() => {
          const b = prizeBanner(quiniela.prize, quiniela.status, " al campeón");
          return b ? <PrizeBanner title={b.title} subline={b.subline} /> : null;
        })()}
      </header>

      {quiniela.notes && (
        <>
          <SectionHeading>Notas</SectionHeading>
          <div className="grain relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-3 text-sm whitespace-pre-wrap text-foreground/90">
            {quiniela.notes}
          </div>
        </>
      )}

      {/* Players table */}
      {quiniela.assignMode === "on_reveal" && quiniela.status === "open" && (
        <div className="grain relative mt-6 flex items-center gap-2.5 overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <span className="text-lg leading-none">🎲</span>
          <span className="text-foreground/90">
            Sorteo en vivo: los equipos se reparten cuando el organizador dé inicio.
          </span>
        </div>
      )}
      <PlayersTable players={data.players} freeSlots={data.freeSlots} />

      {/* Upcoming duels */}
      {data.upcomingDuels.length > 0 && (
        <>
          <SectionHeading>Próximos duelos entre ustedes</SectionHeading>
          <div className="space-y-2.5">
            {data.upcomingDuels.map((d, i) => (
              <DuelRow key={i} d={d} />
            ))}
          </div>
        </>
      )}

      {/* Mundial link */}
      <Link
        to={`/q/${id}/mundial`}
        className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold transition-colors hover:bg-secondary"
      >
        <span className="flex items-center gap-2">
          <span className="text-lg">🌍</span> Ver grupos y bracket del Mundial
        </span>
        <span className="text-muted-foreground">→</span>
      </Link>

      {/* Join CTA — oculto si ya estás inscrito en este dispositivo */}
      {!alreadyJoined &&
        (canJoin ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger
              render={
                <Button
                  size="lg"
                  className="glow-primary mt-6 h-12 w-full rounded-2xl text-base font-bold"
                />
              }
            >
              ⚽ Unirme a la quiniela
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Unirte a {quiniela.name}</DialogTitle>
                <DialogDescription>
                  Te tocarán equipos al azar. Quedan {data.freeSlots}{" "}
                  {data.freeSlots === 1 ? "lugar" : "lugares"}.
                </DialogDescription>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="join-name">Tu nombre</Label>
                  <Input
                    id="join-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. María"
                    maxLength={40}
                    autoFocus
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="join-photo">Foto (opcional)</Label>
                  <Input
                    id="join-photo"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="h-11 rounded-xl font-bold"
                  disabled={busy || uploading || !name.trim()}
                >
                  {busy || uploading ? "Entrando…" : "Confirmar inscripción"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        ) : (
          <div className="mt-6 rounded-2xl border border-border bg-card px-4 py-3.5 text-center text-sm text-muted-foreground">
            {quiniela.status === "open"
              ? "No quedan lugares disponibles."
              : "Las inscripciones ya están cerradas."}
          </div>
        ))}
    </Shell>
  );
}
