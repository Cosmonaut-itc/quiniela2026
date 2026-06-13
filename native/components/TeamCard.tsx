// Port nativo de src/components/TeamCard.tsx. Exporta TeamFlag y TeamCard.
//
// TeamFlag: identidad visual de un equipo — bandera emoji (selecciones) o
// escudo por URL (clubes), decide por prefijo http. Único punto de render de
// `team.flag`. Web <img size-5 object-contain> → expo-image <Image> con
// width/height EXPLÍCITOS (~20px) y contentFit="contain".
//
// TeamCard: una selección del jugador (bandera, nombre, grupo, estado
// vivo/fuera, próximo y último). Los equipos eliminados se atenúan (opacity-45)
// y se tachan (line-through). La web embebe la bandera inline dentro del <p> de
// "Próximo:"; en RN un <Image> NO puede vivir dentro de <Text>, así que esa
// línea se compone como una fila flex de piezas <Text> + <TeamFlag>.
import type { PersonalData } from "@convex/types";
import { whenLabel } from "@shared/format";
import { Image } from "expo-image";
import { Text, View } from "react-native";

import { StatusBadge } from "./StatusBadge";

export function TeamFlag({
  flag,
  name,
  className = "",
}: {
  flag: string;
  name: string;
  className?: string;
}) {
  if (flag.startsWith("http")) {
    return (
      <Image
        testID="team-flag-image"
        source={{ uri: flag }}
        accessibilityLabel={name}
        contentFit="contain"
        // size-5 web (~20px); RN necesita tamaño explícito.
        style={{ width: 20, height: 20 }}
      />
    );
  }
  return <Text className={`font-sans ${className}`}>{flag}</Text>;
}

export function TeamCard({ t }: { t: PersonalData["teams"][number] }) {
  const out = !t.alive;
  return (
    <View
      testID="team-card"
      className={`relative rounded-2xl border border-border bg-card px-3.5 py-3 ${out ? "opacity-45" : ""}`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
          <TeamFlag flag={t.team.flag} name={t.team.name} className="text-2xl leading-none" />
          <View className="min-w-0 flex-1">
            <Text
              testID="team-name"
              numberOfLines={1}
              className={`font-heading text-[0.95rem] font-bold leading-tight text-foreground ${out ? "line-through" : ""}`}
            >
              {t.team.name}
            </Text>
            <Text className="font-sans text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
              Grupo {t.group}
            </Text>
          </View>
        </View>
        <StatusBadge status={out ? "out" : "alive"} className="shrink-0" />
      </View>

      {t.nextMatch ? (
        <View className="mt-2.5 flex-row flex-wrap items-center gap-x-1">
          <Text className="font-sans font-semibold text-xs text-foreground/70">Próximo:</Text>
          <Text className="font-sans text-xs text-muted-foreground">vs</Text>
          <TeamFlag flag={t.nextMatch.opponent.flag} name={t.nextMatch.opponent.name} className="text-xs" />
          <Text className="font-sans text-xs text-muted-foreground">
            {t.nextMatch.opponent.name} · {whenLabel(t.nextMatch.kickoffAt)} ·{" "}
            <Text className="text-foreground/70">de {t.nextMatch.opponentOwner}</Text>
          </Text>
        </View>
      ) : null}

      {t.lastResult ? (
        <Text className="mt-1 font-sans text-xs text-muted-foreground">
          <Text className="font-sans font-semibold text-foreground/70">Último:</Text>{" "}
          {t.lastResult}
        </Text>
      ) : null}
    </View>
  );
}
