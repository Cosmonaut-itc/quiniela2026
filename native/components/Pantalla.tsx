// Scaffold mínimo compartido por las vistas espejo (SEN-24 Task 2): fondo
// oscuro + scroll con safe area. Las vistas completas (SEN-25/26) lo
// reemplazarán por el Shell real (StadiumGlow, BottomNav, etc.).
import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Pantalla base: bg-background + ScrollView con padding de safe area. */
export function Pantalla({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      {/* sin esto el primer tap con teclado abierto solo cierra el teclado y se traga el press del botón (afecta FormularioUnirse y el rescate del home) */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-10"
        contentContainerStyle={{ paddingTop: insets.top + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** Loading mínimo mientras la query está `undefined` (skeletons vienen después). */
export function Cargando() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="font-sans text-sm text-muted-foreground">Cargando…</Text>
    </View>
  );
}
