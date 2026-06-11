import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Shell } from "@/components/Shell";
import { NotificationBell } from "@/components/NotificationBell";
import { PushOptIn } from "@/components/PushOptIn";
import { SectionHeading } from "@/components/bits";
import { PaymentStatusMenu } from "@/components/PaymentStatusMenu";
import { MatchScoreEditor } from "@/components/MatchScoreEditor";
import { formatMXN } from "@shared/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyIcon, LinkIcon } from "lucide-react";

function LoadingState() {
  return (
    <Shell>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-4 h-28 rounded-2xl" />
      <div className="mt-8 space-y-2.5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
    </Shell>
  );
}

export function ProgolAdmin({ id, adminToken }: { id: string; adminToken: string }) {
  const data = useQuery(api.progol.getAdmin, { adminToken });
  const closeReg = useMutation(api.progol.closeRegistration);
  const saveNotes = useMutation(api.quinielas.updateNotes);
  const setPayment = useMutation(api.participants.setParticipantPayment);
  const setResult = useMutation(api.matches.setMatchResultManual);
  const clearOverride = useMutation(api.matches.clearMatchOverride);

  const [closing, setClosing] = useState(false);
  const [notesEdit, setNotesEdit] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  if (data === undefined) return <LoadingState />;
  const { quiniela } = data;
  const joinUrl = `${location.origin}/q/${id}/join/${quiniela.joinToken}`;
  const savedNotes = quiniela.notes ?? "";
  const notesValue = notesEdit ?? savedNotes;
  const perPerson = quiniela.prize.mode === "per_person";
  const statusLabel = quiniela.status === "open" ? "Abierta" : quiniela.status === "locked" ? "Cerrada" : "Finalizada";

  async function copy(text: string, msg = "Copiado") {
    try { await navigator.clipboard.writeText(text); toast.success(msg); }
    catch { toast.error("No se pudo copiar al portapapeles"); }
  }
  async function onClose() {
    setClosing(true);
    try { await closeReg({ adminToken }); toast.success("Inscripción cerrada"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo cerrar"); }
    finally { setClosing(false); }
  }
  async function onSaveNotes() {
    setSavingNotes(true);
    try { await saveNotes({ adminToken, notes: notesValue }); setNotesEdit(null); toast.success("Notas guardadas"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudieron guardar las notas"); }
    finally { setSavingNotes(false); }
  }
  async function onSelectPayment(participantId: string, method: "pending" | "efectivo" | "transferencia") {
    setSavingPaymentId(participantId);
    try { await setPayment({ adminToken, participantId: participantId as Id<"participants">, method }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo actualizar el pago"); }
    finally { setSavingPaymentId(null); }
  }
  async function onSaveScore(externalId: string, homeScore: number, awayScore: number, winnerExternalId: string | null | undefined) {
    setSavingId(externalId);
    try { await setResult({ adminToken, matchExternalId: externalId, homeScore, awayScore, finished: true, winnerExternalId }); toast.success("Marcador actualizado"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setSavingId(null); }
  }
  async function onRevertScore(externalId: string) {
    setSavingId(externalId);
    try { await clearOverride({ adminToken, matchExternalId: externalId }); toast.success("Volvió al resultado automático"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo revertir"); }
    finally { setSavingId(null); }
  }

  return (
    <Shell>
      <header className="grain bg-pitch relative -mx-4 -mt-5 overflow-hidden rounded-b-3xl border-b border-border px-4 pt-8 pb-6">
        <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">Panel de administración · Progol</p>
        <h1 className="mt-1 truncate pr-12 font-heading text-2xl font-extrabold tracking-tight">{quiniela.name}</h1>
        <div className="absolute top-6 right-4"><NotificationBell quinielaId={id} token={adminToken} kind="admin" /></div>
      </header>

      <div className="grain relative mt-5 overflow-hidden rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><LinkIcon className="size-4 text-primary" /> Link de invitación</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">{quiniela.filledCount} inscritos · {statusLabel}</span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">{joinUrl}</code>
          <Button size="icon" className="size-9 shrink-0 rounded-lg" onClick={() => void copy(joinUrl)} aria-label="Copiar link de invitación"><CopyIcon /></Button>
        </div>
        <p className="mt-2 text-[0.7rem] text-muted-foreground">Comparte este link para que cualquiera se inscriba (sin límite).</p>
      </div>

      <PushOptIn adminToken={adminToken} />

      <SectionHeading>Notas</SectionHeading>
      <div className="grain relative overflow-hidden rounded-2xl border border-border bg-card p-4">
        <Textarea value={notesValue} onChange={(e) => setNotesEdit(e.target.value)} placeholder="Reglas, fecha límite de pago, sede… (visible para todos)" aria-label="Notas de la quiniela (visible para todos)" maxLength={1000} rows={3} />
        <Button size="sm" className="mt-2.5 rounded-lg" disabled={savingNotes || notesValue === savedNotes} onClick={() => void onSaveNotes()}>{savingNotes ? "Guardando…" : "Guardar notas"}</Button>
      </div>

      {quiniela.status === "open" && (
        <Button size="lg" className="glow-primary mt-4 h-12 w-full rounded-2xl text-base font-bold" disabled={closing} onClick={() => void onClose()}>
          {closing ? "Cerrando…" : "🔒 Cerrar inscripción"}
        </Button>
      )}

      <SectionHeading>Participantes <span className="ml-1.5 font-medium text-foreground/40">{data.participants.length}</span></SectionHeading>
      {perPerson && (
        <div className="grain relative mb-2.5 overflow-hidden rounded-2xl border border-gold/30 bg-card px-4 py-3 text-sm">
          <div className="font-semibold text-gold">Bote confirmado: {formatMXN(quiniela.prize.pool ?? 0)}</div>
          <div className="mt-0.5 text-[0.7rem] text-muted-foreground">{quiniela.prize.contributors}/{quiniela.filledCount} pagados</div>
        </div>
      )}
      <div className="space-y-2.5">
        {data.participants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">Aún no se inscribe nadie.</div>
        ) : (
          data.participants.map((p) => (
            <div key={p.personalToken} className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="truncate font-heading text-sm font-semibold">{p.name}</div>
                <div className="text-[0.7rem] text-muted-foreground">{p.points} {p.points === 1 ? "punto" : "puntos"}</div>
              </div>
              {perPerson && (
                <PaymentStatusMenu paid={p.paid} method={p.paymentMethod} disabled={savingPaymentId === p.id} onSelect={(method) => void onSelectPayment(p.id, method)} />
              )}
              <Button size="sm" variant="outline" className="shrink-0 rounded-lg" onClick={() => void copy(`${location.origin}/q/${id}/me/${p.personalToken}`, "Link personal copiado")}><LinkIcon /> Copiar link</Button>
            </div>
          ))
        )}
      </div>

      <MatchScoreEditor
        matches={data.matches}
        savingId={savingId}
        onSave={(eid, h, a, w) => void onSaveScore(eid, h, a, w)}
        onRevert={(eid) => void onRevertScore(eid)}
      />
    </Shell>
  );
}
