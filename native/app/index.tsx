// Pantalla smoke provisional: lista los torneos del catálogo para verificar
// la tubería repo-compartido → Convex y los tokens de Uniwind (el compilador
// convierte oklch a hex en build-time; al runtime sobreviven las variables
// CSS). La Task 5 la reemplaza con la demo real.
import { useQuery } from "convex/react";
import { Button, Dialog, useToast } from "heroui-native";
import { useEffect, useRef, useState } from "react";
// Primitivos de react-native a secas: el resolver de uniwind (metro.config.js)
// los redirige a uniwind/components/* con soporte de className.
import { ScrollView, Text } from "react-native";
import { api } from "@convex/_generated/api";
import { GradientFill, GrainCard, gradients } from "@/components/Grain";

export default function Index() {
  const tournaments = useQuery(api.tournaments.list, {});
  // Dialog abierto por default: la captura del smoke se toma sin interacción.
  const [dialogOpen, setDialogOpen] = useState(true);
  const { toast } = useToast();
  // Gotcha de heroui-native: toast.show se recrea cada vez que cambia la lista
  // de toasts, así que un useEffect con dep [toast] se re-dispara tras cada
  // show (loop infinito de "maximum update depth"). El ref limita el smoke a
  // un solo show satisfaciendo exhaustive-deps.
  const toastShownRef = useRef(false);

  useEffect(() => {
    if (toastShownRef.current) {
      return;
    }
    toastShownRef.current = true;
    // Toast al montar para el smoke; placement top para que no se encime con
    // el Dialog centrado (ambos viven en FullWindowOverlays propios en iOS y
    // el del toast queda por encima del backdrop).
    toast.show({
      label: "HeroUI tematizado",
      description: "Estadio nocturno, tema único oscuro",
      placement: "top",
    });
  }, [toast]);

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
      {/* Smoke HeroUI (Task 5 lo reemplaza): Button primary = su --accent,
          que aquí mapea a nuestro --primary indigo; el Dialog pinta --overlay
          (= --popover) sobre el --backdrop del estadio. */}
      <Dialog isOpen={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Trigger asChild>
          <Button variant="primary">Abrir dialog del estadio</Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Close variant="ghost" />
            <Dialog.Title>Estadio nocturno</Dialog.Title>
            <Dialog.Description>
              Superficie --overlay con acción indigo y texto en Sora.
            </Dialog.Description>
            <Button size="sm" className="mt-5" onPress={() => setDialogOpen(false)}>
              Entendido
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
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
