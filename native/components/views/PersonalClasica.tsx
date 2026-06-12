// Vista mínima read-only del panel personal clásico (espejo de
// src/routes/Personal.tsx). SEN-25 la reemplaza por el port completo.
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { Text } from "react-native";
import { api } from "@convex/_generated/api";
import { GrainCard } from "@/components/Grain";
import { Cargando, Pantalla } from "@/components/Pantalla";
import { setToken } from "@/lib/storage";

type Props = { quinielaId: string; personalToken: string };

export function PersonalClasica({ quinielaId, personalToken }: Props) {
  const data = useQuery(api.participants.getPersonalPanel, { personalToken });

  // Espejo del effect del BottomNav web (Shell.tsx): persistir el token
  // personal al montar, solo cuando la query resolvió — un token inválido no
  // se persiste (en la web el BottomNav solo monta en éxito).
  const loaded = data !== undefined;
  useEffect(() => {
    if (!loaded) return;
    void setToken(quinielaId, "me", personalToken);
  }, [loaded, quinielaId, personalToken]);

  if (data === undefined) return <Cargando />;

  const { me } = data;
  const statusLabel =
    me.status === "pending"
      ? "En espera del sorteo"
      : me.status === "champion"
        ? "Campeón"
        : me.status === "out"
          ? "Fuera"
          : `Vivo · ${me.aliveCount} ${me.aliveCount === 1 ? "equipo" : "equipos"}`;

  return (
    <Pantalla>
      <Text className="font-heading font-bold text-2xl text-foreground">
        {me.name}
      </Text>
      <Text className="mt-1 font-sans text-sm text-muted-foreground">
        {data.quinielaName}
      </Text>

      <GrainCard className="mt-5 rounded-2xl border border-border bg-card px-4 py-3">
        <Text className="font-sans font-bold text-sm text-foreground">
          Mi estado
        </Text>
        <Text className="mt-2 font-sans text-sm text-foreground">
          {statusLabel}
        </Text>
      </GrainCard>
    </Pantalla>
  );
}
