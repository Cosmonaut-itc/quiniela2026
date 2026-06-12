// Ruta espejo de /q/:id/admin/:token (src/main.tsx): getMode decide la vista,
// igual que src/routes/Admin.tsx en la web.
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Cargando } from "@/components/Pantalla";
import { AdminClasica } from "@/components/views/AdminClasica";
import { ProgolAdmin } from "@/components/views/ProgolAdmin";

export default function AdminRoute() {
  const { id, token } = useLocalSearchParams<{ id: string; token: string }>();
  const mode = useQuery(api.quinielas.getMode, { id: id as Id<"quinielas"> });
  if (!mode) return <Cargando />;
  return mode.gameMode === "progol" ? (
    <ProgolAdmin quinielaId={id} adminToken={token} />
  ) : (
    <AdminClasica quinielaId={id} adminToken={token} />
  );
}
