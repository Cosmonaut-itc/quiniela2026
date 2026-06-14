// Port nativo del panel personal Progol (SEN-26). Espejo de
// src/routes/progol/ProgolPersonal.tsx: pronosticar 1/X/2 con navegación por
// Ronda — en liga UNA jornada a la vez con ◀▶ (aterriza en la jornada en curso);
// en eliminatorio, todas las etapas en lista.
//
// Salvedades del port nativo (decididas en el spec de SEN-26, actualizado SEN-27):
//   - EditableAvatar / subida de foto → portado en SEN-27 (ya no fuera de alcance).
//     NotificationBell / PushOptIn / push → fuera (SEN-28): se omiten.
//     toast (sonner) para errores de predict → no portado: el catch hace
//     console.warn (mismo patrón aceptado que FormularioUnirse), no revienta el
//     render ni añade dependencias.
//   - bg-pitch (rayas) / header-safe (bleed PWA) / la clase `grain` a mano → se
//     omiten: GrainCard ya aplica el grano y el Shell el inset del safe-area.
//   - Los chevrons ◀▶ son glifos ‹ › en <Text> (lucide-react-native no es
//     dependencia), igual que AnimatedChevron usa ▾.
//
// Persistencia (invariante de identidad): la dueña del token es el BottomNav, que
// vive en el JSX del camino feliz y solo monta cuando getPersonal resolvió SIN
// lanzar — un token inválido lanza en render y el BottomNav nunca monta,
// preservando "un token inválido nunca se persiste". Esta vista NO añade una
// segunda ruta de persistencia (sin setToken propio).
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Pick } from "@convex/types";
import { prizeBanner } from "@shared/format";
import { EditableAvatar } from "@/components/EditableAvatar";
import { PrizeBanner } from "@/components/bits";
import { GrainCard } from "@/components/Grain";
import { Cargando } from "@/components/Pantalla";
import { PredictMatchRow } from "@/components/PredictMatchRow";
import { Shell, BottomNav } from "@/components/Shell";

type Props = { quinielaId: string; personalToken: string };

export function ProgolPersonal({ quinielaId, personalToken }: Props) {
  const data = useQuery(api.progol.getPersonal, { personalToken });
  const mode = useQuery(api.quinielas.getMode, { id: quinielaId as Id<"quinielas"> });
  const predict = useMutation(api.progol.predict);
  const updatePhoto = useMutation(api.participants.updateParticipantPhoto);
  // Se deja propagar el error: EditableAvatar lo registra y revierte el preview
  // optimista (si tragáramos aquí, el avatar mostraría una foto que no se guardó).
  async function onChangePhoto(photoId: Id<"_storage">) {
    await updatePhoto({ personalToken, photoId });
  }
  // Ronda elegida por el usuario; null = aterrizar en la ronda en curso (estado
  // derivado de currentRonda, sin setState en effects — regla del repo). setRonda
  // se llama SOLO en los handlers de press de los chevrons (no en un effect).
  const [ronda, setRonda] = useState<string | null>(null);

  if (data === undefined || mode === undefined) return <Cargando />;
  const { who } = data;

  const isLiga = mode.tournament.format === "liga";
  const labels = data.stages.map((s) => s.label);
  const activeRonda = ronda ?? data.currentRonda;
  const idxRaw = activeRonda ? labels.indexOf(activeRonda) : -1;
  const idx = idxRaw === -1 ? 0 : idxRaw;
  // En liga se muestra UNA jornada a la vez con ◀▶; en eliminatorio, todas.
  const visibleStages = isLiga ? data.stages.slice(idx, idx + 1) : data.stages;

  async function onPick(matchId: string, pick: Pick) {
    try {
      await predict({ personalToken, matchId: matchId as Id<"matches">, pick });
    } catch (e) {
      // Sin toast portado (SEN-28): se registra para diagnóstico y no se revienta
      // el render. El backend reevalúa el kickoff y puede rechazar un partido ya
      // bloqueado entre el render y el tap.
      console.warn("predict falló", e);
    }
  }

  const banner = prizeBanner(data.prize, data.status, " al líder");
  const linkLabel = isLiga
    ? "Ver tabla de posiciones del torneo"
    : "Ver grupos y bracket del Mundial";

  return (
    <Shell
      bottomNav={
        <BottomNav
          id={quinielaId}
          active="me"
          meToken={personalToken}
          joinToken={data.joinToken}
          tournament={mode.tournament}
        />
      }
    >
      {/* Header (web <header className="grain bg-pitch header-safe …">). El
          -mx-4 px-4 lo sangra al borde del Shell; bg-pitch / header-safe se
          omiten (ver cabecera del archivo). */}
      <GrainCard className="-mx-4 rounded-b-3xl border-b border-border px-4 pb-6">
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1 flex-row items-center gap-3">
            <EditableAvatar
              name={who.name}
              url={who.photoUrl}
              size={48}
              onUploaded={onChangePhoto}
            />
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="font-heading text-2xl font-extrabold text-foreground"
              >
                {who.name}
              </Text>
              <Text
                numberOfLines={1}
                className="font-sans text-sm text-muted-foreground"
              >
                {data.quinielaName}
              </Text>
            </View>
          </View>
          {/* Badge de rank/puntos (sin NotificationBell, SEN-28). */}
          <View className="shrink-0 self-start rounded-full bg-primary/15 px-2.5 py-1">
            <Text className="font-heading text-xs font-bold text-primary">
              #{who.rank} · {who.points} pts
            </Text>
          </View>
        </View>
        {banner ? <PrizeBanner title={banner.title} subline={banner.subline} /> : null}
      </GrainCard>

      {/* Bloque de rondas/etapas (web space-y-5 → gap-5). */}
      <View className="mt-2 gap-5">
        {isLiga && labels.length > 0 && (
          <View className="flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Jornada anterior"
              disabled={idx === 0}
              onPress={() => setRonda(labels[idx - 1])}
              className={`px-3 py-2 ${idx === 0 ? "opacity-40" : "active:opacity-70"}`}
            >
              <Text className="font-sans text-2xl leading-none text-foreground">‹</Text>
            </Pressable>
            <Text className="font-heading text-lg font-bold text-foreground">
              {labels[idx]}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Jornada siguiente"
              disabled={idx === labels.length - 1}
              onPress={() => setRonda(labels[idx + 1])}
              className={`px-3 py-2 ${idx === labels.length - 1 ? "opacity-40" : "active:opacity-70"}`}
            >
              <Text className="font-sans text-2xl leading-none text-foreground">›</Text>
            </Pressable>
          </View>
        )}
        {visibleStages.map((s) => (
          <View key={s.stage}>
            {!isLiga ? (
              <Text className="mb-2 px-1 font-sans text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                {s.label}
              </Text>
            ) : null}
            <View className="gap-2.5">
              {s.matches.map((m) => (
                <PredictMatchRow key={m.matchId} m={m} editable onPick={onPick} />
              ))}
            </View>
          </View>
        ))}
      </View>

      {/* Link al torneo (web /q/:id/torneo → nativo /q/[id]/torneo). */}
      <Pressable
        className="mt-6 flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 active:opacity-70"
        accessibilityRole="link"
        accessibilityLabel={linkLabel}
        onPress={() =>
          router.push({ pathname: "/q/[id]/torneo", params: { id: quinielaId } })
        }
      >
        <View className="flex-row items-center gap-2">
          <Text className="font-sans text-lg">🌍</Text>
          <Text className="font-sans font-semibold text-sm text-foreground">
            {linkLabel}
          </Text>
        </View>
        <Text className="font-sans text-sm text-muted-foreground">→</Text>
      </Pressable>
    </Shell>
  );
}
