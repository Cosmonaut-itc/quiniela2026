// Pantalla smoke provisional: lista los torneos del catálogo para verificar
// la tubería repo-compartido → Convex y los tokens NativeWind (oklch en
// runtime). La Task 5 la reemplaza con la demo real.
import { useQuery } from "convex/react";
// Wrappers con className de react-native-css. Importar desde el índice, no de
// los subpaths por componente: esos exponen la condición "react-native" que
// apunta al .tsx fuente y tsc (customConditions de expo/tsconfig.base) lo
// chequearía sin skipLibCheck.
import { ScrollView, Text, View } from "react-native-css/components";
import { api } from "@convex/_generated/api";

export default function Index() {
  const tournaments = useQuery(api.tournaments.list, {});

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="p-6 gap-2"
    >
      <View className="bg-card border border-border rounded-3xl p-4">
        <Text className="text-gold text-lg">Estadio nocturno</Text>
      </View>
      {tournaments === undefined ? (
        <Text className="text-foreground">Cargando torneos…</Text>
      ) : (
        tournaments.map((t) => (
          <Text key={t.code} className="text-foreground text-base">
            {t.name}
          </Text>
        ))
      )}
    </ScrollView>
  );
}
