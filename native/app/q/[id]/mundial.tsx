// Alias espejo de /q/:id/mundial (src/main.tsx): en la web renderiza Mundial
// directamente; aquí redirige a /q/:id/torneo (Href objeto por typedRoutes).
import { Redirect, useLocalSearchParams } from "expo-router";

export { ErrorBoundary } from "expo-router";

export default function MundialAlias() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: "/q/[id]/torneo", params: { id } }} />;
}
