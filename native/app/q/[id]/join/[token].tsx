// Ruta espejo de /q/:id/join/:token (src/main.tsx): getMode decide la vista,
// igual que src/routes/Join.tsx en la web.
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Cargando } from "@/components/Pantalla";
import { JoinClasica } from "@/components/views/JoinClasica";
import { ProgolGeneral } from "@/components/views/ProgolGeneral";

export default function JoinRoute() {
  const { id, token } = useLocalSearchParams<{ id: string; token: string }>();
  const mode = useQuery(api.quinielas.getMode, { id: id as Id<"quinielas"> });
  if (!mode) return <Cargando />;
  return mode.gameMode === "progol" ? (
    <ProgolGeneral quinielaId={id} joinToken={token} />
  ) : (
    <JoinClasica quinielaId={id} joinToken={token} />
  );
}
