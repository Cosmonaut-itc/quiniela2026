// Vista mínima read-only del torneo (espejo de src/routes/Mundial.tsx:
// adaptativa, tabla en ligas / grupos+bracket en eliminatorios). SEN-25/26 la
// reemplazan por el port completo.
import { useQuery } from "convex/react";
import { Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { GrainCard } from "@/components/Grain";
import { Cargando, Pantalla } from "@/components/Pantalla";

type Props = { quinielaId: string };

export function VistaTorneo({ quinielaId }: Props) {
  const data = useQuery(api.mundial.getTorneo, {
    quinielaId: quinielaId as Id<"quinielas">,
  });
  if (data === undefined) return <Cargando />;

  return (
    <Pantalla>
      <View className="flex-row items-center gap-2">
        <Text className="text-2xl">🌍</Text>
        <Text className="font-heading font-bold text-2xl text-foreground">
          {data.tournament.shortName}
        </Text>
      </View>
      <Text className="mt-1 font-sans text-sm text-muted-foreground">
        {data.kind === "league"
          ? "Tabla de posiciones del torneo."
          : "Grupos, posiciones y bracket del torneo."}
      </Text>

      <GrainCard className="mt-5 rounded-2xl border border-border bg-card px-4 py-3">
        {data.kind === "league" ? (
          <Text className="font-sans text-sm text-foreground">
            {data.standings.length} equipos en la tabla
          </Text>
        ) : (
          <Text className="font-sans text-sm text-foreground">
            {data.groups.length} grupos · {data.bracket.length} rondas de
            bracket
          </Text>
        )}
      </GrainCard>
    </Pantalla>
  );
}
