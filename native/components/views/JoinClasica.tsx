// Vista mínima read-only de Join clásica (espejo de src/routes/Join.tsx).
// SEN-25 la reemplaza por el port completo; aquí solo datos reales en crudo.
import { useQuery } from "convex/react";
import { Text } from "react-native";
import { api } from "@convex/_generated/api";
import { GrainCard } from "@/components/Grain";
import { Cargando, Pantalla } from "@/components/Pantalla";

type Props = { quinielaId: string; joinToken: string };

export function JoinClasica({ joinToken }: Props) {
  const data = useQuery(api.quinielas.getOverview, { joinToken });
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
        {quiniela.filledCount} de {quiniela.numParticipants} lugares ·{" "}
        {statusLabel}
      </Text>

      <GrainCard className="mt-5 rounded-2xl border border-border bg-card px-4 py-3">
        <Text className="font-sans font-bold text-sm text-foreground">
          Jugadores
        </Text>
        {data.players.length === 0 ? (
          <Text className="mt-2 font-sans text-sm text-muted-foreground">
            Aún no se inscribe nadie. ¡Sé el primero!
          </Text>
        ) : (
          data.players.map((p) => (
            <Text
              key={p.participantId}
              className="mt-2 font-sans text-sm text-foreground"
            >
              {p.name}
            </Text>
          ))
        )}
        <Text className="mt-3 font-sans text-xs text-muted-foreground">
          {data.freeSlots} {data.freeSlots === 1 ? "lugar libre" : "lugares libres"}
        </Text>
      </GrainCard>
    </Pantalla>
  );
}
