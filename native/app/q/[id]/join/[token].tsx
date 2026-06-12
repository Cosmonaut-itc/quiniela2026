// Ruta espejo de /q/:id/join/:token (src/main.tsx): getMode decide la vista,
// igual que src/routes/Join.tsx en la web.
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Cargando } from "@/components/Pantalla";
import { JoinClasica } from "@/components/views/JoinClasica";
import { ProgolGeneral } from "@/components/views/ProgolGeneral";

// Token inválido/revocado → la query de Convex lanza un error en servidor;
// sin ErrorBoundary expo-router lo propaga al handler global de RN y mata la app
// en producción. La versión tematizada del boundary llega con SEN-25/26.
export { ErrorBoundary } from "expo-router";

export default function JoinRoute() {
  const { id, token } = useLocalSearchParams<{ id: string; token: string }>();
  const mode = useQuery(api.quinielas.getMode, { id: id as Id<"quinielas"> });
  if (mode === undefined) return <Cargando />;
  return mode.gameMode === "progol" ? (
    <ProgolGeneral quinielaId={id} joinToken={token} />
  ) : (
    <JoinClasica quinielaId={id} joinToken={token} />
  );
}
