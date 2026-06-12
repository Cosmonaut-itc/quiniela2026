// Vista mínima read-only del panel personal Progol (espejo de
// src/routes/progol/ProgolPersonal.tsx). SEN-26 la reemplaza por el port real.
import { useQuery } from "convex/react";
import { Text } from "react-native";
import { api } from "@convex/_generated/api";
import { GrainCard } from "@/components/Grain";
import { Cargando, Pantalla } from "@/components/Pantalla";

type Props = { quinielaId: string; personalToken: string };

export function ProgolPersonal({ personalToken }: Props) {
  const data = useQuery(api.progol.getPersonal, { personalToken });
  if (data === undefined) return <Cargando />;

  const { who } = data;

  return (
    <Pantalla>
      <Text className="font-heading font-bold text-2xl text-foreground">
        {who.name}
      </Text>
      <Text className="mt-1 font-sans text-sm text-muted-foreground">
        {data.quinielaName}
      </Text>

      <GrainCard className="mt-5 rounded-2xl border border-border bg-card px-4 py-3">
        <Text className="font-sans font-bold text-sm text-foreground">
          Mi marcha
        </Text>
        <Text className="mt-2 font-sans text-sm text-foreground">
          #{who.rank} · {who.points} pts
        </Text>
      </GrainCard>
    </Pantalla>
  );
}
