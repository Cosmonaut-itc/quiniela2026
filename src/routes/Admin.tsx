import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Shell } from "@/components/Shell";
import { NotificationBell } from "@/components/NotificationBell";
import { SectionHeading } from "@/components/bits";
import { formatMXN } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyIcon, CheckIcon, LinkIcon } from "lucide-react";

function LoadingState() {
  return (
    <Shell>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-4 h-28 rounded-2xl" />
      <div className="mt-8 space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-2xl" />
        ))}
      </div>
    </Shell>
  );
}

export default function Admin() {
  const { id, token } = useParams();
  const data = useQuery(api.quinielas.getAdmin, { adminToken: token! });
  const close = useMutation(api.quinielas.closeAndRedistribute);
  const saveNotes = useMutation(api.quinielas.updateNotes);
  const setPaid = useMutation(api.participants.setParticipantPaid);
  const setResult = useMutation(api.matches.setMatchResultManual);
  const clearOverride = useMutation(api.matches.clearMatchOverride);

  const [scores, setScores] = useState<Record<string, { h?: string; a?: string }>>(
    {},
  );
  const [winners, setWinners] = useState<Record<string, "home" | "draw" | "away">>({});
  const [closing, setClosing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  // `null` significa "sin editar": el editor refleja las notas del servidor.
  const [notesEdit, setNotesEdit] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [togglingPaidId, setTogglingPaidId] = useState<string | null>(null);

  if (data === undefined) return <LoadingState />;

  const { quiniela } = data;
  const reveal = quiniela.assignMode === "on_reveal";
  const joinUrl = `${location.origin}/q/${id}/join/${data.quiniela.joinToken}`;
  const savedNotes = quiniela.notes ?? "";
  // Mientras no se edite, muestra lo que hay en el servidor.
  const notesValue = notesEdit ?? savedNotes;
  const perPerson = quiniela.prize.mode === "per_person";
  const paidCount = quiniela.prize.contributors;
  const pendingCount = quiniela.filledCount - paidCount;
  const pendingPesos = pendingCount * (quiniela.prize.entryFee ?? 0);

  const statusLabel =
    quiniela.status === "open"
      ? "Abierta"
      : quiniela.status === "locked"
        ? "Cerrada"
        : "Finalizada";

  async function copy(text: string, msg = "Copiado") {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  }

  async function onClose() {
    setClosing(true);
    try {
      await close({ adminToken: token! });
      toast.success(reveal ? "¡Equipos repartidos! 🎲" : "Quiniela cerrada · equipos repartidos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar");
    } finally {
      setClosing(false);
    }
  }

  async function onSaveNotes() {
    setSavingNotes(true);
    try {
      await saveNotes({ adminToken: token!, notes: notesValue });
      // Vuelve a reflejar el servidor (la query ya trae las notas guardadas).
      setNotesEdit(null);
      toast.success("Notas guardadas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron guardar las notas");
    } finally {
      setSavingNotes(false);
    }
  }

  async function onTogglePaid(participantId: string, paid: boolean) {
    setTogglingPaidId(participantId);
    try {
      await setPaid({ adminToken: token!, participantId: participantId as Id<"participants">, paid });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el pago");
    } finally {
      setTogglingPaidId(null);
    }
  }

  type AdminMatch = (typeof data.matches)[number];

  // En eliminatoria el empate necesita un ganador explícito (penales/prórroga);
  // preselecciona con el ganador efectivo que ya trae la quiniela.
  function selectedWinner(m: AdminMatch): "home" | "draw" | "away" {
    return (
      winners[m.externalId] ??
      (m.winnerExternalId && m.winnerExternalId === m.homeExternalId
        ? "home"
        : m.winnerExternalId && m.winnerExternalId === m.awayExternalId
          ? "away"
          : "draw")
    );
  }

  async function saveScore(m: AdminMatch) {
    const s = scores[m.externalId] ?? {};
    const homeScore = Number(s.h ?? m.homeScore ?? 0);
    const awayScore = Number(s.a ?? m.awayScore ?? 0);
    let winnerExternalId: string | null | undefined = undefined;
    if (m.stage !== "group") {
      const sel = selectedWinner(m);
      winnerExternalId =
        sel === "home" ? m.homeExternalId : sel === "away" ? m.awayExternalId : null;
    }
    setSavingId(m.externalId);
    try {
      await setResult({
        adminToken: token!,
        matchExternalId: m.externalId,
        homeScore,
        awayScore,
        finished: true,
        winnerExternalId,
      });
      toast.success("Marcador actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSavingId(null);
    }
  }

  async function revertScore(externalId: string) {
    setSavingId(externalId);
    try {
      await clearOverride({ adminToken: token!, matchExternalId: externalId });
      // Suelta la selección local de ganador para que un guardado posterior no
      // reaplique el ganador viejo (el partido volvió al automático).
      setWinners((prev) => {
        const next = { ...prev };
        delete next[externalId];
        return next;
      });
      toast.success("Volvió al resultado automático");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo revertir");
    } finally {
      setSavingId(null);
    }
  }

  const playableMatches = data.matches.filter((m) => m.homeTeam && m.awayTeam);

  return (
    <Shell>
      {/* Header */}
      <header className="grain bg-pitch relative -mx-4 -mt-5 overflow-hidden rounded-b-3xl border-b border-border px-4 pt-8 pb-6">
        <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">
          Panel de administración
        </p>
        <h1 className="mt-1 truncate font-heading text-2xl font-extrabold tracking-tight">
          {quiniela.name}
        </h1>
        <div className="absolute top-6 right-4">
          <NotificationBell quinielaId={id!} token={token!} kind="admin" />
        </div>
      </header>

      {/* Invite link card */}
      <div className="grain relative mt-5 overflow-hidden rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <LinkIcon className="size-4 text-primary" /> Link de invitación
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
            {quiniela.filledCount}/{quiniela.numParticipants} · {statusLabel}
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
            {joinUrl}
          </code>
          <Button
            size="icon"
            className="size-9 shrink-0 rounded-lg"
            onClick={() => void copy(joinUrl)}
            aria-label="Copiar link de invitación"
          >
            <CopyIcon />
          </Button>
        </div>
        <p className="mt-2 text-[0.7rem] text-muted-foreground">
          Comparte este link para que cualquiera se inscriba.
        </p>
      </div>

      {/* Notes editor */}
      <SectionHeading>Notas</SectionHeading>
      <div className="grain relative overflow-hidden rounded-2xl border border-border bg-card p-4">
        <Textarea
          value={notesValue}
          onChange={(e) => setNotesEdit(e.target.value)}
          placeholder="Reglas, fecha límite de pago, sede… (visible para todos)"
          aria-label="Notas de la quiniela (visible para todos)"
          maxLength={1000}
          rows={3}
        />
        <Button
          size="sm"
          className="mt-2.5 rounded-lg"
          disabled={savingNotes || notesValue === savedNotes}
          onClick={() => void onSaveNotes()}
        >
          {savingNotes ? "Guardando…" : "Guardar notas"}
        </Button>
      </div>

      {/* Close & redistribute */}
      {quiniela.status === "open" && (
        <>
          <Button
            size="lg"
            className="glow-primary mt-4 h-12 w-full rounded-2xl text-base font-bold"
            disabled={closing}
            onClick={() => void onClose()}
          >
            {reveal
              ? closing
                ? "Repartiendo…"
                : "🎲 Repartir equipos ahora"
              : closing
                ? "Cerrando…"
                : "🔒 Cerrar y repartir equipos"}
          </Button>
          {reveal && (
            <p className="mt-2 text-center text-[0.7rem] text-muted-foreground">
              {quiniela.filledCount} {quiniela.filledCount === 1 ? "jugador inscrito" : "jugadores inscritos"} · nadie tiene equipos hasta que repartas
            </p>
          )}
        </>
      )}

      {/* Participants */}
      <SectionHeading>
        Participantes
        <span className="ml-1.5 font-medium text-foreground/40">
          {data.participants.length}
        </span>
      </SectionHeading>
      {perPerson && (
        <div className="grain relative mb-2.5 overflow-hidden rounded-2xl border border-gold/30 bg-card px-4 py-3 text-sm">
          <div className="font-semibold text-gold">
            Bote confirmado: {formatMXN(quiniela.prize.pool ?? 0)}
          </div>
          <div className="mt-0.5 text-[0.7rem] text-muted-foreground">
            {paidCount}/{quiniela.filledCount} pagados
            {pendingCount > 0 && ` · ${formatMXN(pendingPesos)} pendientes`}
          </div>
        </div>
      )}
      <div className="space-y-2.5">
        {data.participants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
            Aún no se inscribe nadie.
          </div>
        ) : (
          data.participants.map((p) => (
            <div
              key={p.personalToken}
              className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <div className="truncate font-heading text-sm font-semibold">
                  {p.name}
                </div>
                <div className="text-[0.7rem] text-muted-foreground">
                  {p.teamCount} {p.teamCount === 1 ? "equipo" : "equipos"}
                </div>
              </div>
              {perPerson && (
                <button
                  type="button"
                  onClick={() => void onTogglePaid(p.id, !p.paid)}
                  disabled={togglingPaidId === p.id}
                  aria-pressed={p.paid}
                  className={
                    "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 " +
                    (p.paid
                      ? "bg-alive/15 text-alive"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground")
                  }
                >
                  {p.paid ? "✓ Pagó" : "Pendiente"}
                </button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 rounded-lg"
                onClick={() =>
                  void copy(
                    `${location.origin}/q/${id}/me/${p.personalToken}`,
                    "Link personal copiado",
                  )
                }
              >
                <LinkIcon /> Copiar link
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Fix scores */}
      <SectionHeading>Corregir marcador</SectionHeading>
      {playableMatches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
          No hay partidos con equipos definidos todavía.
        </div>
      ) : (
        <div className="space-y-2.5">
          {playableMatches.map((m) => {
            const s = scores[m.externalId] ?? {};
            const saving = savingId === m.externalId;
            return (
              <div
                key={m.externalId}
                className="rounded-2xl border border-border bg-card px-3.5 py-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
                    {m.label}
                  </span>
                  {m.manualOverride && (
                    <span className="flex items-center gap-2">
                      <span className="text-[0.65rem] font-semibold text-gold">
                        editado a mano
                      </span>
                      <button
                        type="button"
                        disabled={savingId === m.externalId}
                        onClick={() => void revertScore(m.externalId)}
                        className="text-[0.65rem] font-semibold text-muted-foreground underline-offset-2 hover:text-gold hover:underline disabled:opacity-50"
                      >
                        ↺ volver al automático
                      </button>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="text-lg leading-none">
                      {m.homeTeam!.flag}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {m.homeTeam!.code}
                    </span>
                  </span>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`Goles ${m.homeTeam!.code}`}
                    className="h-9 w-12 shrink-0 text-center"
                    value={s.h ?? (m.homeScore ?? "")}
                    onChange={(e) =>
                      setScores((prev) => ({
                        ...prev,
                        [m.externalId]: { ...prev[m.externalId], h: e.target.value },
                      }))
                    }
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-label={`Goles ${m.awayTeam!.code}`}
                    className="h-9 w-12 shrink-0 text-center"
                    value={s.a ?? (m.awayScore ?? "")}
                    onChange={(e) =>
                      setScores((prev) => ({
                        ...prev,
                        [m.externalId]: { ...prev[m.externalId], a: e.target.value },
                      }))
                    }
                  />
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
                    <span className="truncate text-sm font-medium">
                      {m.awayTeam!.code}
                    </span>
                    <span className="text-lg leading-none">
                      {m.awayTeam!.flag}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    className="size-9 shrink-0 rounded-lg"
                    disabled={saving}
                    aria-label="Guardar marcador"
                    onClick={() => void saveScore(m)}
                  >
                    {saving ? (
                      <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <CheckIcon />
                    )}
                  </Button>
                </div>
                {m.stage !== "group" && (
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
                      Ganador
                    </span>
                    {(
                      [
                        ["home", m.homeTeam!.code],
                        ["draw", "Empate"],
                        ["away", m.awayTeam!.code],
                      ] as const
                    ).map(([key, lbl]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setWinners((p) => ({ ...p, [m.externalId]: key }))}
                        className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                          selectedWinner(m) === key
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/60 text-muted-foreground"
                        }`}
                        aria-pressed={selectedWinner(m) === key}
                        aria-label={`Ganador ${lbl}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
