// Port nativo de src/components/DuelRow.tsx. Un duelo próximo entre dos
// participantes de la quiniela: homeOwner 🏳 vs 🏳 awayOwner · <kickoff>.
//
// Conversión web → nativo:
//   - div → View, span → Text (todo texto en <Text> con su clase de fuente);
//   - la web embebe <TeamFlag> al lado del <span> del dueño dentro de un flex
//     row: en RN un <Image> (escudo por URL) NO puede vivir dentro de <Text>,
//     así que cada lado se compone como una fila de hermanos <Text> + <TeamFlag>
//     (igual que TeamCard hace con la línea "Próximo:").
//   - font-semibold sobre texto font-sans (Sora SemiBold/600) es el port fiel:
//     la salvedad de fuente solo muerde sobre `font-heading`.
//   - bg-card/60 y border-dashed se conservan idénticos a la web.
import type { OverviewData } from "@convex/types";
import { whenLabel } from "@shared/format";
import { Text, View } from "react-native";

import { TeamFlag } from "./TeamCard";

export function DuelRow({ d }: { d: OverviewData["upcomingDuels"][number] }) {
  return (
    <View className="rounded-2xl border border-dashed border-border bg-card/60 px-3.5 py-2.5">
      <View className="flex-row items-center justify-between gap-2">
        {/* Local: nombre + bandera, alineados a la derecha. */}
        <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1.5">
          <Text
            numberOfLines={1}
            className="font-sans text-sm font-semibold text-foreground"
          >
            {d.homeOwner}
          </Text>
          <TeamFlag flag={d.homeTeam.flag} name={d.homeTeam.name} className="text-xl leading-none" />
        </View>

        <View className="shrink-0 rounded-full bg-muted px-2 py-0.5">
          <Text className="font-sans text-[0.65rem] font-bold tracking-wide text-muted-foreground">
            VS
          </Text>
        </View>

        {/* Visitante: bandera + nombre, alineados a la izquierda. */}
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
          <TeamFlag flag={d.awayTeam.flag} name={d.awayTeam.name} className="text-xl leading-none" />
          <Text
            numberOfLines={1}
            className="font-sans text-sm font-semibold text-foreground"
          >
            {d.awayOwner}
          </Text>
        </View>
      </View>

      <Text className="mt-1 text-center font-sans text-[0.7rem] font-medium text-muted-foreground">
        {whenLabel(d.kickoffAt)}
      </Text>
    </View>
  );
}
