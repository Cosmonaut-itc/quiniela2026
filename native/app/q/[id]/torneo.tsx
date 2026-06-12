// Ruta espejo de /q/:id/torneo (src/main.tsx → src/routes/Mundial.tsx): sin
// token, solo necesita el id de la quiniela.
import { useLocalSearchParams } from "expo-router";
import { VistaTorneo } from "@/components/views/VistaTorneo";

export { ErrorBoundary } from "expo-router";

export default function TorneoRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VistaTorneo quinielaId={id} />;
}
