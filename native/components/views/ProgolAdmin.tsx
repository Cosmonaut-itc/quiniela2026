// Vista mínima read-only del panel admin Progol (espejo de
// src/routes/progol/ProgolAdmin.tsx). SEN-26 la reemplaza por el port real.
import { useQuery } from "convex/react";
import { Text } from "react-native";
import { api } from "@convex/_generated/api";
import { GrainCard } from "@/components/Grain";
import { Cargando, Pantalla } from "@/components/Pantalla";

type Props = { quinielaId: string; adminToken: string };

export function ProgolAdmin({ adminToken }: Props) {
  const data = useQuery(api.progol.getAdmin, { adminToken });
  if (data === undefined) return <Cargando />;

  const { quiniela } = data;
  const statusLabel =
    quiniela.status === "open"
      ? "Abierta"
      : quiniela.status === "locked"
        ? "Cerrada"
        : "Finalizada";

  return (
    <Pantalla>
      {/* tracking 0.2em a 12px → 2.4px (uniwind resuelve em contra el root) */}
      <Text className="font-sans font-bold text-xs tracking-[2.4px] text-gold uppercase">
        Panel de administración · Progol
      </Text>
      <Text className="mt-1 font-heading font-bold text-2xl text-foreground">
        {quiniela.name}
      </Text>

      <GrainCard className="mt-5 rounded-2xl border border-border bg-card px-4 py-3">
        <Text className="font-sans font-bold text-sm text-foreground">
          Participantes
        </Text>
        <Text className="mt-2 font-sans text-sm text-foreground">
          {data.participants.length}{" "}
          {data.participants.length === 1 ? "inscrito" : "inscritos"} ·{" "}
          {statusLabel}
        </Text>
      </GrainCard>
    </Pantalla>
  );
}
