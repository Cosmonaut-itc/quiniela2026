// Port nativo de src/components/PlayerRow.tsx. Una fila de la tabla de
// jugadores. Tocar una carta con equipos la expande y revela los equipos del
// jugador (bandera + nombre + pastilla vivo/fuera). Los jugadores sin equipos
// (p. ej. antes de un sorteo on_reveal) se renderizan como carta estática NO
// expandible. Eliminados atenuados y tachados; el campeón en dorado.
//
// Conversión web → nativo / salvedades del port:
//   - div → View, span → Text (todo texto en <Text> con su clase de fuente);
//     <li>/<ul> → View; button/Collapsible → Pressable + estado React.
//   - la clase `grain` de la carta web → <GrainCard> (overlay de ruido +
//     relative/overflow-hidden); su overlay tiene pointerEvents=none y no roba
//     los toques del Pressable.
//   - Collapsible (Base UI) → estado local `open` (useState). El panel se MONTA
//     solo cuando open (la web también lo recorta; aquí montar/desmontar basta
//     para el comportamiento). Tocar la fila alterna el estado.
//   - chevron: la web usa lucide-react `<ChevronDown>` + `group-data-[panel-open]:
//     rotate-180`; uniwind 1.9.0 NO compila transition-*/group-data-*, y
//     lucide-react-native NO es dependencia (ver native/package.json). Se porta
//     como un `▾` <Text> rotado por react-native-reanimated (sí es dep), con el
//     ángulo derivado del estado open vía withTiming → ver <AnimatedChevron>
//     (componente compartido con PlayersTable).
//   - anillo de campeón: la web aplica `.gold-ring` (box-shadow oro, no
//     reproducible como utility en uniwind). Se aproxima envolviendo el Avatar
//     en `<View rounded-full border-2 border-gold>` (el ring de 1px es la parte
//     load-bearing; ver la nota de la Tarea B en Avatar.tsx).
//   - fuentes: el nombre web es `font-heading font-semibold`; en nativo
//     `font-heading font-semibold` remaparía a una FAMILIA y perdería Bricolage,
//     así que se porta a `font-heading font-bold` (= Bricolage Bold). El conteo
//     de vivos `font-heading font-bold` ya es weight 700 → Bricolage Bold fiel.
import type { OverviewData } from "@convex/types";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AnimatedChevron } from "./AnimatedChevron";
import { Avatar } from "./Avatar";
import { GrainCard } from "./Grain";
import { StatusBadge } from "./StatusBadge";
import { TeamFlag } from "./TeamCard";

type Player = OverviewData["players"][number];

/** Un equipo dentro de la carta expandida: bandera + nombre + pastilla vivo/fuera. */
function PlayerTeamRow({ t }: { t: Player["teams"][number] }) {
  const out = !t.alive;
  return (
    <View className={`flex-row items-center justify-between gap-2 ${out ? "opacity-45" : ""}`}>
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <TeamFlag flag={t.team.flag} name={t.team.name} className="text-lg leading-none" />
        <Text
          numberOfLines={1}
          className={`min-w-0 flex-1 font-sans text-sm text-foreground ${out ? "line-through" : ""}`}
        >
          {t.team.name}
        </Text>
      </View>
      <StatusBadge status={t.alive ? "alive" : "out"} className="shrink-0" />
    </View>
  );
}

/**
 * Avatar + nombre a la izquierda; conteo de vivos + estado (+ chevron) a la
 * derecha. `open` solo se pasa en filas expandibles (rige el chevron).
 */
function PlayerSummary({
  p,
  open,
}: {
  p: Player;
  open?: boolean;
}) {
  const out = p.status === "out";
  const champ = p.status === "champion";
  const pending = p.status === "pending";
  return (
    <View className="w-full flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        {champ ? (
          <View testID="champion-ring" className="rounded-full border-2 border-gold">
            <Avatar name={p.name} url={p.photoUrl} size={38} />
          </View>
        ) : (
          <Avatar name={p.name} url={p.photoUrl} size={38} />
        )}
        <Text
          testID="player-name"
          numberOfLines={1}
          className={`min-w-0 flex-1 font-heading text-[0.95rem] font-bold text-foreground ${out ? "line-through" : ""}`}
        >
          {p.name}
        </Text>
      </View>

      <View className="shrink-0 flex-row items-center gap-2.5">
        {!pending && (
          <View className="flex-row items-baseline gap-0.5">
            <Text
              className={`font-heading text-lg font-bold leading-none ${
                champ ? "text-gold" : out ? "text-eliminated" : "text-alive"
              }`}
            >
              {p.aliveCount}
            </Text>
            <Text className="font-sans text-xs text-muted-foreground">
              /{p.totalCount} vivos
            </Text>
          </View>
        )}
        <StatusBadge status={p.status} />
        {open !== undefined && (
          <AnimatedChevron
            open={open}
            testID="player-chevron"
            className="text-sm text-muted-foreground"
          />
        )}
      </View>
    </View>
  );
}

export function PlayerRow({ p }: { p: Player }) {
  const out = p.status === "out";
  const champ = p.status === "champion";
  const expandable = p.teams.length > 0;
  const [open, setOpen] = useState(false);

  // La web monta la carta con la clase `grain` → <GrainCard> añade el overlay de
  // ruido + relative/overflow-hidden; el borde/fondo/radio van por className
  // igual que en la web. El overlay de grano tiene pointerEvents=none → no roba
  // los toques del Pressable.
  const cardClass = `rounded-2xl border bg-card ${
    champ ? "border-gold/30" : "border-border"
  } ${out ? "opacity-45" : ""}`;

  if (!expandable) {
    return (
      <GrainCard className={`${cardClass} px-3.5 py-3`}>
        <PlayerSummary p={p} />
      </GrainCard>
    );
  }

  const toggle = () => setOpen((prev) => !prev);

  return (
    <GrainCard className={cardClass}>
      <Pressable
        testID="player-row-trigger"
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="w-full px-3.5 py-3"
      >
        <PlayerSummary p={p} open={open} />
      </Pressable>
      {open && (
        <View className="gap-1.5 border-t border-border px-3.5 py-2.5">
          {p.teams.map((t) => (
            <PlayerTeamRow key={t.team.code} t={t} />
          ))}
        </View>
      )}
    </GrainCard>
  );
}
