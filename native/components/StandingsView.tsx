// Port nativo de src/components/StandingsView.tsx (SEN-25, Tarea D). Tabla de
// posiciones de liga (Vista Torneo, formato liga). Misma estética que
// GroupsView. Salvedades del port:
//   - <table>/<tr>/<td> → Views en fila (RN no tiene tablas); las columnas
//     numéricas usan anchos fijos (w-8 / w-10) y van alineadas a la derecha
//     como en la web; el nombre de equipo se trunca (numberOfLines={1});
//   - la utility web `grain` → <GrainCard> (overflow-hidden + relative + ruido);
//     el resto de clases se pasan por className igual que la web;
//   - la bandera es un HERMANO flex, nunca dentro de <Text>; todo texto en
//     <Text> con su clase de fuente explícita.
import type { TeamLite } from "@convex/types";
import { Text, View } from "react-native";

import { TeamFlag } from "@/components/TeamCard";
import { GrainCard } from "@/components/Grain";

type Row = { team: TeamLite; points: number; played: number; gd: number; gf: number };

export function StandingsView({ standings }: { standings: Row[] }) {
  return (
    <GrainCard className="rounded-3xl border border-border bg-card p-4">
      {/* Cabecera */}
      <View className="flex-row items-center">
        <Text className="w-8 text-left text-[0.65rem] font-sans uppercase tracking-widest text-muted-foreground">
          #
        </Text>
        <Text className="flex-1 text-left text-[0.65rem] font-sans uppercase tracking-widest text-muted-foreground">
          Equipo
        </Text>
        <Text className="w-8 text-right text-[0.65rem] font-sans uppercase tracking-widest text-muted-foreground">
          PJ
        </Text>
        <Text className="w-8 text-right text-[0.65rem] font-sans uppercase tracking-widest text-muted-foreground">
          Dif
        </Text>
        <Text className="w-8 text-right text-[0.65rem] font-sans uppercase tracking-widest text-muted-foreground">
          GF
        </Text>
        <Text className="w-10 text-right text-[0.65rem] font-sans uppercase tracking-widest text-muted-foreground">
          Pts
        </Text>
      </View>

      {/* Filas */}
      {standings.map((r, i) => (
        <View
          key={r.team.code}
          className="flex-row items-center border-t border-border/50 py-2"
        >
          <Text className="w-8 text-left text-sm font-sans text-muted-foreground">
            {i + 1}
          </Text>
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <TeamFlag flag={r.team.flag} name={r.team.name} className="text-lg leading-none" />
            <Text numberOfLines={1} className="shrink text-sm font-sans font-medium text-foreground">
              {r.team.name}
            </Text>
          </View>
          <Text className="w-8 text-right text-sm font-sans text-muted-foreground">
            {r.played}
          </Text>
          <Text className="w-8 text-right text-sm font-sans text-foreground">
            {r.gd > 0 ? `+${r.gd}` : r.gd}
          </Text>
          <Text className="w-8 text-right text-sm font-sans text-muted-foreground">
            {r.gf}
          </Text>
          <Text className="w-10 text-right text-sm font-sans font-bold text-foreground">
            {r.points}
          </Text>
        </View>
      ))}
    </GrainCard>
  );
}
