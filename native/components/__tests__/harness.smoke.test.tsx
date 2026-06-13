/**
 * Smoke test del harness (SEN-25, Tarea A). Prueba que jest-expo + RNTL +
 * Uniwind (className como no-op) montan juntos un árbol RN real. NO asierta
 * estilos computados — solo presencia de texto/contenido, que es todo lo que
 * las tareas siguientes necesitan del harness.
 */
import { render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";

import { GrainCard } from "@/components/Grain";

describe("harness smoke", () => {
  it("renderiza View+Text con className (Uniwind no-op en jest)", () => {
    render(
      <View className="bg-card">
        <Text className="font-sans text-foreground">hola</Text>
      </View>,
    );

    // className no se compila en jest (Uniwind va por metro); el texto sí debe
    // estar visible — prueba que RNTL ve el árbol y que className no rompe nada.
    expect(screen.getByText("hola")).toBeOnTheScreen();
  });

  it("renderiza GrainCard con un hijo Text (de-riesga la Tarea B)", () => {
    // GrainCard usa expo-image (vía RN Image) + expo-linear-gradient en el
    // overlay de grano. Si monta sin mocks extra, las tarjetas reales (PlayerRow,
    // TeamCard) que envuelven contenido en GrainCard también montarán.
    render(
      <GrainCard className="rounded-2xl border border-border bg-card p-4">
        <Text className="font-sans text-foreground">contenido</Text>
      </GrainCard>,
    );

    expect(screen.getByText("contenido")).toBeOnTheScreen();
  });
});
