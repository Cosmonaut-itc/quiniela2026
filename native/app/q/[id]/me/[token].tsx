// Ruta espejo de /q/:id/me/:token (src/main.tsx): getMode decide la vista,
// igual que src/routes/Personal.tsx en la web.
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Cargando } from "@/components/Pantalla";
import { PersonalClasica } from "@/components/views/PersonalClasica";
import { ProgolPersonal } from "@/components/views/ProgolPersonal";

export default function PersonalRoute() {
  const { id, token } = useLocalSearchParams<{ id: string; token: string }>();
  const mode = useQuery(api.quinielas.getMode, { id: id as Id<"quinielas"> });
  if (!mode) return <Cargando />;
  return mode.gameMode === "progol" ? (
    <ProgolPersonal quinielaId={id} personalToken={token} />
  ) : (
    <PersonalClasica quinielaId={id} personalToken={token} />
  );
}
