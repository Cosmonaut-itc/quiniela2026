// Port nativo de src/components/Leaderboard.tsx. Tabla de posiciones del modo
// progol: cada fila es pulsable y abre la tarjeta del jugador (onSelect).
//
// Conversión web→RN: div→View, span→Text, button→Pressable; no hay `cn` →
// className se compone con template strings. La web usa la utility `.grain`
// (overflow-hidden + ruido) en cada fila → <GrainCard> (ya aplica relative,
// overflow-hidden y el grano). El hover:/transition web no existe en RN.
//
// Fuentes (regla del proyecto): `font-heading font-semibold` PIERDE Bricolage
// en RN; el nombre va `font-bold` como en TeamCard nativo.
import type { ProgolLeaderRow } from "@convex/types";
import { Avatar } from "@/components/Avatar";
import { EmptyTile } from "@/components/bits";
import { GrainCard } from "@/components/Grain";
import { Pressable, Text, View } from "react-native";

/** Tabla de posiciones del modo progol. Tocar una fila abre la tarjeta del jugador. */
export function Leaderboard({
  rows,
  onSelect,
}: {
  rows: ProgolLeaderRow[];
  onSelect?: (participantId: string) => void;
}) {
  if (rows.length === 0) {
    // Mismo borde punteado + texto muted que el estado vacío web; se reusa el
    // primitivo nativo EmptyTile (idéntico visual) en vez de duplicar las clases.
    return <EmptyTile>Aún no hay jugadores.</EmptyTile>;
  }
  return (
    <View className="gap-2">
      {rows.map((r) => (
        <Pressable
          key={r.participantId}
          accessibilityRole="button"
          accessibilityLabel={`Ver tarjeta de ${r.name}`}
          onPress={() => onSelect?.(r.participantId)}
        >
          <GrainCard className="flex-row items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-2.5">
            <Text
              className={`w-6 shrink-0 text-center font-heading text-sm font-bold tabular-nums ${
                r.rank === 1 ? "text-gold" : "text-muted-foreground"
              }`}
            >
              {r.rank}
            </Text>
            <Avatar name={r.name} url={r.photoUrl} size={34} />
            <Text
              numberOfLines={1}
              className="min-w-0 flex-1 font-heading text-sm font-bold text-foreground"
            >
              {r.name}
            </Text>
            <View className="shrink-0 items-end">
              <Text className="font-heading text-base font-bold tabular-nums text-foreground">
                {r.points}
                <Text className="font-sans text-[0.7rem] font-normal text-muted-foreground">
                  {" "}
                  pts
                </Text>
              </Text>
              <Text className="font-sans text-[0.65rem] text-muted-foreground">
                {r.correct}/{r.played} aciertos
              </Text>
            </View>
          </GrainCard>
        </Pressable>
      ))}
    </View>
  );
}
