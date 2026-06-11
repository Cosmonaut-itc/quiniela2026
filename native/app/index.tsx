// Pantalla smoke provisional: lista los torneos del catálogo para verificar
// la tubería repo-compartido → Convex. La Task 3 la reemplaza con la UI real.
import { ScrollView, Text } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

export default function Index() {
  const tournaments = useQuery(api.tournaments.list, {});

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 24, gap: 8 }}
    >
      {tournaments === undefined ? (
        <Text style={{ color: "#e7f5ef" }}>Cargando torneos…</Text>
      ) : (
        tournaments.map((t) => (
          <Text key={t.code} style={{ color: "#e7f5ef", fontSize: 16 }}>
            {t.name}
          </Text>
        ))
      )}
    </ScrollView>
  );
}
