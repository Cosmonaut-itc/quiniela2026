// Pantalla smoke provisional: lista los torneos del catálogo para verificar
// la tubería repo-compartido → Convex y los tokens de Uniwind (el compilador
// convierte oklch a hex en build-time; al runtime sobreviven las variables
// CSS). La Task 5 la reemplaza con la demo real.
import { useQuery } from "convex/react";
// Primitivos de react-native a secas: el resolver de uniwind (metro.config.js)
// los redirige a uniwind/components/* con soporte de className.
import { ScrollView, Text } from "react-native";
import { api } from "@convex/_generated/api";
import { GradientFill, GrainCard, gradients } from "@/components/Grain";

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
      {/* Smoke del grano: misma receta de clases que una card web con .grain */}
      <GrainCard className="bg-card border border-border rounded-3xl p-4">
        <Text className="font-sans font-semibold text-gold text-lg">Estadio nocturno</Text>
        <Text className="font-sans font-medium text-muted-foreground text-sm">
          Sora medium · semibold arriba · regular abajo
        </Text>
      </GrainCard>
      {/* Smoke del gradiente: el PrizeBanner web (grain + border-gold/30 + gradiente) */}
      <GrainCard className="border border-gold/30 rounded-2xl px-4 py-3">
        <GradientFill {...gradients.prizeBanner} />
        <Text className="font-sans font-semibold text-gold text-sm">
          🏆 Premio al campeón
        </Text>
      </GrainCard>
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
