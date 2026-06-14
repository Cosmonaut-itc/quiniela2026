// Port nativo del panel admin Progol (espejo de src/routes/progol/ProgolAdmin.tsx).
// Operable end-to-end: link de invitación (Share), notas, cerrar inscripción,
// pagos, corrección de marcador y FOTO de quiniela (EditableAvatar →
// updateQuinielaPhoto). Diferencias vs Clásica: contador "N inscritos" (sin tope),
// "🔒 Cerrar inscripción" (closeRegistration), bote sin desglose por método, la
// fila de participante muestra puntos.
//
// Salvedades (SEN-27): NotificationBell / PushOptIn → fuera (SEN-28). Sin toast:
// errores → console.warn. bg-pitch / animate-* omitidos; grano vía GrainCard.
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Pressable, Text, TextInput, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { formatMXN } from "@shared/format";
import { EditableAvatar } from "@/components/EditableAvatar";
import { GrainCard } from "@/components/Grain";
import { MatchScoreEditor } from "@/components/MatchScoreEditor";
import { PaymentStatusMenu } from "@/components/PaymentStatusMenu";
import { Cargando, Pantalla } from "@/components/Pantalla";
import { SectionHeading } from "@/components/bits";
import { buildJoinUrl, buildPersonalUrl, shareLink } from "@/lib/share";

type Props = { quinielaId: string; adminToken: string };

export function ProgolAdmin({ quinielaId, adminToken }: Props) {
  const data = useQuery(api.progol.getAdmin, { adminToken });
  const updatePhoto = useMutation(api.quinielas.updateQuinielaPhoto);
  const closeReg = useMutation(api.progol.closeRegistration);
  const saveNotes = useMutation(api.quinielas.updateNotes);
  const setPayment = useMutation(api.participants.setParticipantPayment);
  const setResult = useMutation(api.matches.setMatchResultManual);
  const clearOverride = useMutation(api.matches.clearMatchOverride);

  const [closing, setClosing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notesEdit, setNotesEdit] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);

  if (data === undefined) return <Cargando />;

  const { quiniela } = data;
  const joinUrl = buildJoinUrl(quinielaId, quiniela.joinToken);
  const savedNotes = quiniela.notes ?? "";
  const notesValue = notesEdit ?? savedNotes;
  const perPerson = quiniela.prize.mode === "per_person";
  const statusLabel =
    quiniela.status === "open" ? "Abierta" : quiniela.status === "locked" ? "Cerrada" : "Finalizada";

  async function onChangePhoto(photoId: Id<"_storage">) {
    try {
      await updatePhoto({ adminToken, photoId });
    } catch (e) {
      console.warn("ProgolAdmin: no se pudo actualizar la foto", e);
    }
  }
  async function onClose() {
    setClosing(true);
    try {
      await closeReg({ adminToken });
    } catch (e) {
      console.warn("ProgolAdmin: no se pudo cerrar la inscripción", e);
    } finally {
      setClosing(false);
    }
  }
  async function onSaveNotes() {
    setSavingNotes(true);
    try {
      await saveNotes({ adminToken, notes: notesValue });
      setNotesEdit(null);
    } catch (e) {
      console.warn("ProgolAdmin: no se pudieron guardar las notas", e);
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
      await setPayment({ adminToken, participantId: participantId as Id<"participants">, method });
    } catch (e) {
      console.warn("ProgolAdmin: no se pudo actualizar el pago", e);
    } finally {
      setSavingPaymentId(null);
    }
  }
  async function onSaveScore(
    externalId: string,
    homeScore: number,
    awayScore: number,
    winnerExternalId: string | null | undefined,
  ) {
    setSavingId(externalId);
    try {
      await setResult({
        adminToken,
        matchExternalId: externalId,
        homeScore,
        awayScore,
        finished: true,
        winnerExternalId,
      });
    } catch (e) {
      console.warn("ProgolAdmin: no se pudo guardar el marcador", e);
    } finally {
      setSavingId(null);
    }
  }
  async function onRevertScore(externalId: string) {
    setSavingId(externalId);
    try {
      await clearOverride({ adminToken, matchExternalId: externalId });
    } catch (e) {
      console.warn("ProgolAdmin: no se pudo revertir", e);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Pantalla>
      <GrainCard className="-mx-4 rounded-b-3xl border-b border-border px-4 pb-6">
        <View className="flex-row items-center gap-3">
          <EditableAvatar
            name={quiniela.name}
            url={quiniela.photoUrl}
            size={48}
            onUploaded={onChangePhoto}
          />
          <View className="min-w-0 flex-1">
            <Text className="font-sans text-xs font-bold uppercase tracking-[2.4px] text-gold">
              Panel de administración · Progol
            </Text>
            <Text numberOfLines={1} className="mt-0.5 font-heading text-2xl font-extrabold text-foreground">
              {quiniela.name}
            </Text>
          </View>
        </View>
      </GrainCard>

      <GrainCard className="mt-5 rounded-2xl border border-border bg-card p-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans text-sm font-semibold text-foreground">🔗 Link de invitación</Text>
          <View className="rounded-full bg-muted px-2 py-0.5">
            <Text className="font-sans text-[0.7rem] font-semibold text-muted-foreground">
              {quiniela.filledCount} inscritos · {statusLabel}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} className="mt-2.5 rounded-lg bg-muted/60 px-2.5 py-2 font-sans text-xs text-muted-foreground">
          {joinUrl}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compartir link de invitación"
          onPress={() => void shareLink(joinUrl, "Únete a mi quiniela:")}
          className="mt-2.5 h-11 items-center justify-center rounded-xl bg-primary active:opacity-80"
        >
          <Text className="font-sans text-sm font-bold text-primary-foreground">Compartir invitación</Text>
        </Pressable>
        <Text className="mt-2 font-sans text-[0.7rem] text-muted-foreground">
          Comparte este link para que cualquiera se inscriba (sin límite).
        </Text>
      </GrainCard>

      <SectionHeading>Notas</SectionHeading>
      <GrainCard className="rounded-2xl border border-border bg-card p-4">
        <TextInput
          accessibilityLabel="Notas de la quiniela (visible para todos)"
          value={notesValue}
          onChangeText={setNotesEdit}
          placeholder="Reglas, fecha límite de pago, sede… (visible para todos)"
          placeholderTextColor="#7b8a82"
          multiline
          maxLength={1000}
          className="min-h-20 rounded-lg border border-border bg-muted/40 px-3 py-2 font-sans text-sm text-foreground"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Guardar notas"
          disabled={savingNotes || notesValue === savedNotes}
          onPress={() => void onSaveNotes()}
          className={`mt-2.5 h-10 items-center justify-center self-start rounded-lg bg-primary px-4 ${savingNotes || notesValue === savedNotes ? "opacity-50" : "active:opacity-80"}`}
        >
          <Text className="font-sans text-sm font-bold text-primary-foreground">
            {savingNotes ? "Guardando…" : "Guardar notas"}
          </Text>
        </Pressable>
      </GrainCard>

      {quiniela.status === "open" && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar inscripción"
          disabled={closing}
          onPress={() => void onClose()}
          className={`mt-4 h-12 items-center justify-center rounded-2xl bg-primary ${closing ? "opacity-50" : "active:opacity-80"}`}
        >
          <Text className="font-sans text-base font-bold text-primary-foreground">
            {closing ? "Cerrando…" : "🔒 Cerrar inscripción"}
          </Text>
        </Pressable>
      )}

      <SectionHeading>
        Participantes{" "}
        <Text className="font-sans font-medium text-foreground/40">{data.participants.length}</Text>
      </SectionHeading>
      {perPerson && (
        <GrainCard className="mb-2.5 rounded-2xl border border-gold/30 bg-card px-4 py-3">
          <Text className="font-sans text-sm font-semibold text-gold">
            Bote confirmado: {formatMXN(quiniela.prize.pool ?? 0)}
          </Text>
          <Text className="mt-0.5 font-sans text-[0.7rem] text-muted-foreground">
            {quiniela.prize.contributors}/{quiniela.filledCount} pagados
          </Text>
        </GrainCard>
      )}
      <View className="gap-2.5">
        {data.participants.length === 0 ? (
          <View className="rounded-2xl border border-dashed border-border px-4 py-3">
            <Text className="text-center font-sans text-xs text-muted-foreground">
              Aún no se inscribe nadie.
            </Text>
          </View>
        ) : (
          data.participants.map((p) => (
            <View
              key={p.personalToken}
              className="flex-row items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5"
            >
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="font-heading text-sm font-semibold text-foreground">
                  {p.name}
                </Text>
                <Text className="font-sans text-[0.7rem] text-muted-foreground">
                  {p.points} {p.points === 1 ? "punto" : "puntos"}
                </Text>
              </View>
              {perPerson && (
                <PaymentStatusMenu
                  paid={p.paid}
                  method={p.paymentMethod}
                  disabled={savingPaymentId === p.id}
                  onSelect={(method) => void onSelectPayment(p.id, method)}
                />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Compartir link de ${p.name}`}
                onPress={() =>
                  void shareLink(buildPersonalUrl(quinielaId, p.personalToken), "Tu link personal:")
                }
                className="shrink-0 rounded-lg border border-border px-3 py-2 active:opacity-70"
              >
                <Text className="font-sans text-xs font-semibold text-foreground">🔗 Compartir</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      <MatchScoreEditor
        matches={data.matches}
        savingId={savingId}
        onSave={(eid, h, a, w) => void onSaveScore(eid, h, a, w)}
        onRevert={(eid) => void onRevertScore(eid)}
      />
    </Pantalla>
  );
}
