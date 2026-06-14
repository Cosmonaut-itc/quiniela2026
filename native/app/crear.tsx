// Pantalla de creación de quiniela (espejo de src/routes/Home.tsx). Selector de
// torneo (prepara on-demand los que no tienen equipos), modo filtrado por
// allowedModes, premio fijo/por-persona, participantes/reparto (solo clásica),
// notas y foto (galería → Convex storage al elegir). Al crear: persiste el
// adminToken y aterriza en el panel admin.
//
// RN: cada texto/textinput con color explícito. Estado derivado (sin setState en
// effects): effectiveGameMode/modes/maxParticipants se calculan en render. Sin
// toast: errores → console.warn.
import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { EditableAvatar } from "@/components/EditableAvatar";
import { Pantalla } from "@/components/Pantalla";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import { setToken } from "@/lib/storage";

export { ErrorBoundary } from "expo-router";

type AssignMode = "on_join" | "on_reveal";
type PrizeMode = "fixed" | "per_person";
type GameMode = "clasica" | "progol";

export default function Crear() {
  const tournaments = useQuery(api.tournaments.list, {}) ?? [];
  const create = useMutation(api.quinielas.createQuiniela);
  const prepare = useAction(api.tournaments.prepare);
  const { pickAndUpload, busy: uploading } = usePhotoUpload();

  const [tournamentCode, setTournamentCode] = useState("WC");
  const [preparing, setPreparing] = useState(false);
  const [name, setName] = useState("");
  const [prize, setPrize] = useState("");
  const [n, setN] = useState(10);
  const [notes, setNotes] = useState("");
  const [assignMode, setAssignMode] = useState<AssignMode>("on_join");
  const [prizeMode, setPrizeMode] = useState<PrizeMode>("fixed");
  const [fee, setFee] = useState(200);
  const [gameMode, setGameMode] = useState<GameMode>("clasica");
  const [photoId, setPhotoId] = useState<Id<"_storage"> | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Derivado (regla del repo: nunca setState en effects).
  const tournament = tournaments.find((t) => t.code === tournamentCode);
  const modes = tournament?.allowedModes ?? ["clasica", "progol"];
  const effectiveGameMode: GameMode = modes.includes(gameMode) ? gameMode : "progol";
  const maxParticipants = tournament?.teamCount || 48;

  async function selectTournament(code: string) {
    setTournamentCode(code);
    const t = tournaments.find((x) => x.code === code);
    if (t && t.teamCount === 0) {
      setPreparing(true);
      try {
        const result = await prepare({ code });
        if (result.teamCount > 0 && n > result.teamCount) setN(result.teamCount);
      } catch (e) {
        console.warn("crear: no se pudo preparar el torneo", e);
      } finally {
        setPreparing(false);
      }
    }
  }

  async function onPickPhoto() {
    const r = await pickAndUpload();
    if (!r) return;
    setPhotoId(r.photoId);
    setPhotoUri(r.uri);
  }

  async function submit() {
    if (!name.trim() || n < 2) return;
    setBusy(true);
    try {
      const res = await create({
        name,
        prizeText: prizeMode === "per_person" ? "" : prize,
        numParticipants: Math.min(n, maxParticipants),
        photoId: photoId ?? undefined,
        assignMode,
        prizeMode,
        entryFee: prizeMode === "per_person" ? fee : undefined,
        notes,
        gameMode: effectiveGameMode,
        tournamentCode,
      });
      // El adminToken es válido por construcción: lo persiste quien lo crea.
      await setToken(res.quinielaId, "admin", res.adminToken);
      router.replace({
        pathname: "/q/[id]/admin/[token]",
        params: { id: res.quinielaId, token: res.adminToken },
      });
    } catch (e) {
      console.warn("crear: no se pudo crear la quiniela", e);
    } finally {
      setBusy(false);
    }
  }

  const disabled =
    busy ||
    uploading ||
    preparing ||
    !name.trim() ||
    n < 2 ||
    (prizeMode === "per_person" && fee < 1) ||
    (tournament !== undefined && tournament.teamCount === 0);

  return (
    <Pantalla>
      <View className="flex-row items-center gap-3">
        <EditableAvatar
          name={name || "Quiniela"}
          url={photoUri}
          size={56}
          onUploaded={async (id) => setPhotoId(id)}
        />
        <View className="min-w-0 flex-1">
          <Text className="font-sans text-xs font-bold uppercase tracking-[0.22em] text-gold">
            {tournament?.name ?? "Mundial 2026"}
          </Text>
          <Text className="mt-0.5 font-heading text-2xl font-extrabold text-foreground">
            Crear quiniela
          </Text>
        </View>
      </View>
      <Text className="mt-2 font-sans text-sm text-muted-foreground">
        {effectiveGameMode === "progol"
          ? "Crea tu quiniela, pronostica cada partido y que gane quien más acierte. 🎯"
          : "Crea tu quiniela, reparte equipos al azar y que gane el dueño del campeón. 🏆"}
      </Text>

      {/* Torneo */}
      <Text className="mt-6 mb-2 font-sans text-sm font-semibold text-foreground">Torneo</Text>
      <View className="flex-row flex-wrap gap-2">
        {tournaments.map((t) => {
          const active = tournamentCode === t.code;
          return (
            <Pressable
              key={t.code}
              accessibilityRole="button"
              accessibilityLabel={`Torneo ${t.shortName}`}
              accessibilityState={{ selected: active, disabled: preparing }}
              disabled={preparing}
              onPress={() => void selectTournament(t.code)}
              className={`flex-row items-center gap-1.5 rounded-xl border px-3 py-1.5 ${active ? "border-primary bg-primary/10" : "border-border bg-card"} ${preparing ? "opacity-50" : "active:opacity-70"}`}
            >
              <Text className={`font-sans text-sm font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {t.shortName}
              </Text>
              <View className={`rounded px-1 py-0.5 ${t.format === "eliminatorio" ? "bg-gold/20" : "bg-primary/20"}`}>
                <Text className={`font-sans text-[0.6rem] font-bold uppercase tracking-wide ${t.format === "eliminatorio" ? "text-gold" : "text-primary"}`}>
                  {t.format === "eliminatorio" ? "Eliminatorio" : "Liga"}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {preparing && (
        <Text className="mt-2 font-sans text-xs text-muted-foreground">
          Preparando torneo… esto puede tardar unos segundos.
        </Text>
      )}

      {/* Modo de juego */}
      <Text className="mt-6 mb-2 font-sans text-sm font-semibold text-foreground">Modo de juego</Text>
      <View className="flex-row gap-2">
        {(
          [
            { v: "clasica" as const, title: "Clásica", sub: `Se reparten los ${maxParticipants} equipos; gana el dueño del campeón.` },
            { v: "progol" as const, title: "Progol 🎯", sub: "Cada quien pronostica 1/X/2 por partido; gana quien más acierte." },
          ]
        ).map((o) => {
          const active = effectiveGameMode === o.v;
          const available = modes.includes(o.v);
          return (
            <Pressable
              key={o.v}
              accessibilityRole="button"
              accessibilityLabel={`Modo ${o.title}`}
              accessibilityState={{ selected: active, disabled: !available }}
              disabled={!available}
              onPress={() => setGameMode(o.v)}
              className={`flex-1 rounded-2xl border px-3 py-2.5 ${active ? "border-primary bg-primary/10" : available ? "border-border bg-card" : "border-border bg-card/50 opacity-50"}`}
            >
              <Text className="font-sans text-sm font-bold text-foreground">{o.title}</Text>
              <Text className="mt-0.5 font-sans text-[0.7rem] leading-snug text-muted-foreground">{o.sub}</Text>
              {!available && (
                <Text className="mt-1 font-sans text-[0.6rem] italic text-muted-foreground">
                  No disponible para este torneo
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Nombre */}
      <Text className="mt-6 mb-2 font-sans text-sm font-semibold text-foreground">Nombre de la quiniela</Text>
      <TextInput
        accessibilityLabel="Nombre de la quiniela"
        value={name}
        onChangeText={setName}
        placeholder="Quiniela de la oficina"
        placeholderTextColor="#7b8a82"
        maxLength={60}
        className="h-12 rounded-xl border border-border bg-card px-3 font-sans text-base text-foreground"
      />

      {/* Premio */}
      <Text className="mt-6 mb-2 font-sans text-sm font-semibold text-foreground">Premio</Text>
      <View className="flex-row gap-2">
        {(
          [
            { v: "fixed" as const, title: "Premio fijo", sub: "Un monto o frase para el dueño del campeón." },
            { v: "per_person" as const, title: "Por participación 💰", sub: "Cuota por persona; el bote se arma con quienes confirmen su pago." },
          ]
        ).map((o) => {
          const active = prizeMode === o.v;
          return (
            <Pressable
              key={o.v}
              accessibilityRole="button"
              accessibilityLabel={`Premio ${o.title}`}
              accessibilityState={{ selected: active }}
              onPress={() => setPrizeMode(o.v)}
              className={`flex-1 rounded-2xl border px-3 py-2.5 ${active ? "border-primary bg-primary/10" : "border-border bg-card"}`}
            >
              <Text className="font-sans text-sm font-bold text-foreground">{o.title}</Text>
              <Text className="mt-0.5 font-sans text-[0.7rem] leading-snug text-muted-foreground">{o.sub}</Text>
            </Pressable>
          );
        })}
      </View>
      {prizeMode === "fixed" ? (
        <TextInput
          accessibilityLabel="Premio fijo"
          value={prize}
          onChangeText={setPrize}
          placeholder="$5,000 / La gloria eterna"
          placeholderTextColor="#7b8a82"
          maxLength={60}
          className="mt-2 h-12 rounded-xl border border-border bg-card px-3 font-sans text-base text-foreground"
        />
      ) : (
        <View className="mt-2 flex-row items-center gap-2">
          <Text className="font-sans text-lg font-bold text-muted-foreground">$</Text>
          <TextInput
            accessibilityLabel="Cuota por persona"
            keyboardType="number-pad"
            value={String(fee)}
            onChangeText={(t) => setFee(Math.max(1, Math.floor(Number(t) || 0)))}
            placeholder="200"
            placeholderTextColor="#7b8a82"
            className="h-12 flex-1 rounded-xl border border-border bg-card px-3 font-sans text-base text-foreground"
          />
          <Text className="font-sans text-sm text-muted-foreground">por persona</Text>
        </View>
      )}

      {/* Participantes + reparto (solo clásica) */}
      {effectiveGameMode === "clasica" && (
        <>
          <Text className="mt-6 mb-2 font-sans text-sm font-semibold text-foreground">
            {prizeMode === "per_person" ? "Máximo de participantes" : "Número de participantes"}
          </Text>
          <TextInput
            accessibilityLabel="Número de participantes"
            keyboardType="number-pad"
            value={String(n)}
            onChangeText={(t) =>
              setN(Math.max(2, Math.min(maxParticipants, Math.floor(Number(t) || 0))))
            }
            className="h-12 rounded-xl border border-border bg-card px-3 font-sans text-base text-foreground"
          />
          <Text className="mt-1 font-sans text-xs text-muted-foreground">
            {prizeMode === "per_person"
              ? `Tope de gente; el bote refleja a quienes ya pagaron. Los ${maxParticipants} equipos se reparten entre ustedes.`
              : `Entre 2 y ${maxParticipants} · los ${maxParticipants} equipos se reparten entre ustedes.`}
          </Text>

          <Text className="mt-6 mb-2 font-sans text-sm font-semibold text-foreground">Reparto de equipos</Text>
          <View className="flex-row gap-2">
            {(
              [
                { v: "on_join" as const, title: "Al unirse", sub: "Cada quien recibe sus equipos al inscribirse." },
                { v: "on_reveal" as const, title: "Sorteo en vivo 🎲", sub: "Nadie recibe equipos hasta que des click. Más emoción." },
              ]
            ).map((o) => {
              const active = assignMode === o.v;
              return (
                <Pressable
                  key={o.v}
                  accessibilityRole="button"
                  accessibilityLabel={`Reparto ${o.title}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => setAssignMode(o.v)}
                  className={`flex-1 rounded-2xl border px-3 py-2.5 ${active ? "border-primary bg-primary/10" : "border-border bg-card"}`}
                >
                  <Text className="font-sans text-sm font-bold text-foreground">{o.title}</Text>
                  <Text className="mt-0.5 font-sans text-[0.7rem] leading-snug text-muted-foreground">{o.sub}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Notas */}
      <Text className="mt-6 mb-2 font-sans text-sm font-semibold text-foreground">Notas (opcional)</Text>
      <TextInput
        accessibilityLabel="Notas"
        value={notes}
        onChangeText={setNotes}
        placeholder="Reglas, fecha límite de pago, sede…"
        placeholderTextColor="#7b8a82"
        multiline
        maxLength={1000}
        className="min-h-20 rounded-xl border border-border bg-card px-3 py-2 font-sans text-base text-foreground"
      />

      {/* Foto */}
      <Text className="mt-6 mb-2 font-sans text-sm font-semibold text-foreground">Foto (opcional)</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Elegir foto de la quiniela"
        disabled={uploading}
        onPress={() => void onPickPhoto()}
        className={`h-12 items-center justify-center rounded-xl border border-border bg-card ${uploading ? "opacity-50" : "active:opacity-70"}`}
      >
        <Text className="font-sans text-sm font-semibold text-foreground">
          {uploading ? "Subiendo…" : photoId ? "✓ Foto elegida · cambiar" : "📷 Elegir foto"}
        </Text>
      </Pressable>

      {/* Submit */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Crear quiniela"
        disabled={disabled}
        onPress={() => void submit()}
        className={`mt-6 h-12 items-center justify-center rounded-2xl bg-primary ${disabled ? "opacity-50" : "active:opacity-80"}`}
      >
        <Text className="font-sans text-base font-bold text-primary-foreground">
          {preparing ? "Preparando torneo…" : busy ? "Creando…" : "⚽ Crear quiniela"}
        </Text>
      </Pressable>
    </Pantalla>
  );
}
