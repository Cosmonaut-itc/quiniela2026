import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Shell } from "@/components/Shell";
import { NotificationBell } from "@/components/NotificationBell";
import { PushOptIn } from "@/components/PushOptIn";
import { SectionHeading } from "@/components/bits";
import { PaymentStatusMenu } from "@/components/PaymentStatusMenu";
import { formatMXN } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyIcon, LinkIcon } from "lucide-react";
import { MatchScoreEditor } from "@/components/MatchScoreEditor";

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
  const setPayment = useMutation(api.participants.setParticipantPayment);
  const setResult = useMutation(api.matches.setMatchResultManual);
  const clearOverride = useMutation(api.matches.clearMatchOverride);

  const [closing, setClosing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  // `null` significa "sin editar": el editor refleja las notas del servidor.
  const [notesEdit, setNotesEdit] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);

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
  const entryFee = quiniela.prize.entryFee ?? 0;
  const pendingPesos = pendingCount * entryFee;
  const efectivoPesos = quiniela.methodCounts.efectivo * entryFee;
  const transferenciaPesos = quiniela.methodCounts.transferencia * entryFee;
  const sinClasificar = paidCount - quiniela.methodCounts.efectivo - quiniela.methodCounts.transferencia;

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

  async function onSelectPayment(
    participantId: string,
    method: "pending" | "efectivo" | "transferencia",
  ) {
    setSavingPaymentId(participantId);
    try {
      await setPayment({
        adminToken: token!,
        participantId: participantId as Id<"participants">,
        method,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el pago");
    } finally {
      setSavingPaymentId(null);
    }
  }

  async function onSaveScore(
    externalId: string, homeScore: number, awayScore: number, winnerExternalId: string | null | undefined,
  ) {
    setSavingId(externalId);
    try {
      await setResult({ adminToken: token!, matchExternalId: externalId, homeScore, awayScore, finished: true, winnerExternalId });
      toast.success("Marcador actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSavingId(null);
    }
  }

  async function onRevertScore(externalId: string) {
    setSavingId(externalId);
    try {
      await clearOverride({ adminToken: token!, matchExternalId: externalId });
      toast.success("Volvió al resultado automático");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo revertir");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Shell>
      {/* Header */}
      <header className="grain bg-pitch relative -mx-4 -mt-5 overflow-hidden rounded-b-3xl border-b border-border px-4 pt-8 pb-6">
        <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">
          Panel de administración
        </p>
        <h1 className="mt-1 truncate pr-12 font-heading text-2xl font-extrabold tracking-tight">
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

      <PushOptIn adminToken={token!} />

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
          {paidCount > 0 && (
            <div className="mt-0.5 text-[0.7rem] text-muted-foreground">
              Efectivo: {formatMXN(efectivoPesos)} · Transferencia: {formatMXN(transferenciaPesos)}
              {sinClasificar > 0 && ` · Sin clasificar: ${formatMXN(sinClasificar * entryFee)}`}
            </div>
          )}
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
                <PaymentStatusMenu
                  paid={p.paid}
                  method={p.paymentMethod}
                  disabled={savingPaymentId === p.id}
                  onSelect={(method) => void onSelectPayment(p.id, method)}
                />
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
      <MatchScoreEditor
        matches={data.matches}
        savingId={savingId}
        onSave={(id, h, a, w) => void onSaveScore(id, h, a, w)}
        onRevert={(id) => void onRevertScore(id)}
      />
    </Shell>
  );
}
