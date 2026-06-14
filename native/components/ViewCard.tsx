// Tarjeta read-only de pronósticos de OTRO jugador (SEN-26). Espejo del
// ViewCardDialog web de src/routes/progol/ProgolGeneral.tsx.
//
// PRIMER <Modal> del código nativo: no hay Dialog/BottomSheet portado todavía
// (CONTEXT §8), así que se usa el <Modal> integrado de react-native. Decisiones:
//   - transparent + animationType="fade" + visible={!!participantId}: el Modal
//     monta su contenido SOLO cuando hay participantId (con visible={false} RN no
//     renderiza los children) → la apertura/cierre la maneja el estado `viewing`
//     de ProgolGeneral, igual que el `open` del Dialog web.
//   - tap-fuera-cierra: el backdrop es un <Pressable> que llama onClose; la hoja
//     inferior es OTRO <Pressable> con onPress no-op. En RN, el hijo que se vuelve
//     responder al tocar evita que el press burbujee al backdrop (no hay
//     stopPropagation como en el DOM) → tocar dentro de la hoja NO cierra.
//   - editable={false}: la tarjeta es de otro jugador, los pronósticos se ven pero
//     no se editan (PredictMatchRow deshabilita el PickSelector con editable=false).
//   - se filtran los matches `pending` (rival por definir): una etapa cuyos
//     matches son todos pending no muestra su heading (espejo del filtro web).
//   - getCard se omite (useQuery "skip") mientras participantId es null, para no
//     suscribirse sin tarjeta seleccionada.
import { useQuery } from "convex/react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

import { PredictMatchRow } from "@/components/PredictMatchRow";

export function ViewCard({
  joinToken,
  participantId,
  onClose,
}: {
  joinToken: string;
  participantId: string | null;
  onClose: () => void;
}) {
  const card = useQuery(
    api.progol.getCard,
    participantId
      ? { joinToken, participantId: participantId as Id<"participants"> }
      : "skip",
  );

  return (
    <Modal
      visible={!!participantId}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Backdrop oscuro: tocar fuera de la hoja cierra. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar tarjeta"
        onPress={onClose}
        className="flex-1 justify-end bg-black/60"
      >
        {/* Hoja inferior. onPress no-op: en RN el hijo que se vuelve responder
            evita que el tap interno dispare el backdrop (no hay stopPropagation). */}
        <Pressable
          onPress={() => {}}
          className="max-h-[80%] rounded-t-3xl border-t border-border bg-card"
        >
          <View className="flex-row items-start justify-between gap-3 px-4 pt-4 pb-2">
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="font-heading text-lg font-bold text-foreground"
              >
                {card?.who.name ?? "Pronósticos"}
              </Text>
              <Text className="font-sans text-sm text-muted-foreground">
                {card
                  ? `Lugar #${card.who.rank} · ${card.who.points} pts`
                  : "Cargando…"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              onPress={onClose}
              className="px-2 py-1 active:opacity-70"
            >
              <Text className="font-sans text-xl text-muted-foreground">✕</Text>
            </Pressable>
          </View>
          <ScrollView className="px-4" contentContainerClassName="gap-4 pb-6">
            {card?.stages.map((s) => {
              const shown = s.matches.filter((m) => m.state !== "pending");
              if (shown.length === 0) return null;
              return (
                <View key={s.stage}>
                  <Text className="mb-1.5 font-sans text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                    {s.label}
                  </Text>
                  <View className="gap-2">
                    {shown.map((m) => (
                      <PredictMatchRow key={m.matchId} m={m} editable={false} />
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
