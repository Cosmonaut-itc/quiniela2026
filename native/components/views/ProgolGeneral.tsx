// Vista mínima read-only de la general Progol (espejo de
// src/routes/progol/ProgolGeneral.tsx). SEN-26 la reemplaza por el port real.
import { useQuery } from "convex/react";
import { Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import { GrainCard } from "@/components/Grain";
import { Cargando, Pantalla } from "@/components/Pantalla";

type Props = { quinielaId: string; joinToken: string };

export function ProgolGeneral({ joinToken }: Props) {
  const data = useQuery(api.progol.getGeneral, { joinToken });
  if (data === undefined) return <Cargando />;

  const { quiniela } = data;
  const statusLabel =
    quiniela.status === "open"
      ? "Inscripciones abiertas"
      : quiniela.status === "locked"
        ? "Inscripciones cerradas"
        : "Mundial finalizado";

  return (
    <Pantalla>
      <Text className="font-heading font-bold text-2xl text-foreground">
        {quiniela.name}
      </Text>
      <Text className="mt-1 font-sans text-sm text-muted-foreground">
        {quiniela.filledCount}{" "}
        {quiniela.filledCount === 1 ? "jugador" : "jugadores"} · {statusLabel}
      </Text>

      <GrainCard className="mt-5 rounded-2xl border border-border bg-card px-4 py-3">
        <Text className="font-sans font-bold text-sm text-foreground">
          Tabla de posiciones · {data.decidedMatches} jugados
        </Text>
        {data.leaderboard.length === 0 ? (
          <Text className="mt-2 font-sans text-sm text-muted-foreground">
            Aún no se inscribe nadie.
          </Text>
        ) : (
          data.leaderboard.map((row) => (
            <View
              key={row.participantId}
              className="mt-2 flex-row items-center justify-between"
            >
              <Text className="font-sans text-sm text-foreground">
                #{row.rank} {row.name}
              </Text>
              <Text className="font-sans text-sm text-muted-foreground">
                {row.points} pts
              </Text>
            </View>
          ))
        )}
      </GrainCard>
    </Pantalla>
  );
}
