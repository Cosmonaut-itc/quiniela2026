// Pantalla smoke provisional: lista los torneos del catálogo para verificar
// la tubería repo-compartido → Convex y los tokens NativeWind (el compilador
// convierte oklch a hex en build-time; al runtime sobreviven las variables
// CSS). La Task 5 la reemplaza con la demo real.
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
      {/* font-sans va explícito en cada <Text>: RN no hereda font-family
          (ver el comentario de los tokens en global.css). */}
      <Text className="font-heading font-bold text-2xl text-foreground">
        Quiniela 2026
      </Text>
      <View className="bg-card border border-border rounded-3xl p-4">
        <Text className="font-sans font-semibold text-gold text-lg">Estadio nocturno</Text>
        <Text className="font-sans font-medium text-muted-foreground text-sm">
          Sora medium · semibold arriba · regular abajo
        </Text>
      </View>
      {tournaments === undefined ? (
        <Text className="font-sans text-foreground">Cargando torneos…</Text>
      ) : (
        tournaments.map((t) => (
          <Text key={t.code} className="font-sans text-foreground text-base">
            {t.name}
          </Text>
        ))
      )}
    </ScrollView>
  );
}
