// Port nativo de src/components/PlayersTable.tsx. Sección colapsable "Tabla de
// jugadores". Arranca expandida; tocar el encabezado colapsa toda la lista para
// ahorrar espacio. Cada carta se expande por su cuenta para mostrar los equipos
// de ese jugador (ver PlayerRow).
//
// Conversión web → nativo / salvedades del port:
//   - Collapsible (Base UI) → estado local `open` (useState(true), arranca
//     expandida como la web `defaultOpen`). El cuerpo se MONTA solo cuando open.
//   - encabezado: web <button> → Pressable; mismo label "Tabla de jugadores · N".
//   - chevron: web lucide ChevronDown + group-data-[panel-open]:rotate-180;
//     uniwind no compila eso y lucide-react-native no es dep, así que un `▾`
//     <Text> rotado por react-native-reanimated, derivado del estado open →
//     ver <AnimatedChevron> (componente compartido con PlayerRow).
//   - pluralización de freeSlots idéntica a la web (1 → "lugar libre",
//     N → "lugares libres").
import type { OverviewData } from "@convex/types";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AnimatedChevron } from "./AnimatedChevron";
import { EmptyTile } from "./bits";
import { PlayerRow } from "./PlayerRow";

export function PlayersTable({
  players,
  freeSlots,
}: {
  players: OverviewData["players"];
  freeSlots: number;
}) {
  const [open, setOpen] = useState(true); // arranca expandida → chevron arriba.

  const toggle = () => setOpen((prev) => !prev);

  return (
    <View>
      <Pressable
        testID="players-table-header"
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="mt-6 mb-2.5 w-full flex-row items-center justify-between gap-2 px-1"
      >
        <Text className="font-sans text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">
          Tabla de jugadores · {players.length}
        </Text>
        <AnimatedChevron
          open={open}
          testID="players-table-chevron"
          className="text-[0.7rem] text-muted-foreground"
        />
      </Pressable>

      {open && (
        <View className="gap-2.5">
          {players.length === 0 ? (
            <EmptyTile>Aún no se inscribe nadie. ¡Sé el primero!</EmptyTile>
          ) : (
            players.map((p) => <PlayerRow key={p.participantId} p={p} />)
          )}
          {freeSlots > 0 && (
            <EmptyTile>
              ＋ {freeSlots} {freeSlots === 1 ? "lugar libre" : "lugares libres"} ·
              esperando jugador
            </EmptyTile>
          )}
        </View>
      )}
    </View>
  );
}
