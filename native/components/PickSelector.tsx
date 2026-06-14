// Port nativo de src/components/PickSelector.tsx. Control segmentado 1/X/2
// (mismo patrón que el "Ganador" del admin clásico). Cada opción es un
// <Pressable> con accessibilityState selected/disabled (mapeo de aria-pressed /
// aria-label / disabled del web). No hay `cn` ni cascada CSS en RN: las clases
// se componen con template strings y cada <Text> lleva su propia clase de fuente.
import type { Pick } from "@convex/types";
import { Pressable, Text, View } from "react-native";

export function PickSelector({
  value,
  onPick,
  disabled,
  options,
}: {
  value: Pick | null;
  onPick: (p: Pick) => void;
  disabled?: boolean;
  options: { home: string; away: string };
}) {
  const items: [Pick, string][] = [
    ["home", options.home],
    ["draw", "Empate"],
    ["away", options.away],
  ];
  return (
    <View className="flex-row items-center gap-1.5">
      {items.map(([key, lbl]) => {
        const active = value === key;
        return (
          <Pressable
            key={key}
            disabled={disabled}
            onPress={() => onPick(key)}
            accessibilityRole="button"
            accessibilityLabel={`Pronóstico ${lbl}`}
            accessibilityState={{ selected: active, disabled: !!disabled }}
            className={`flex-1 rounded-lg px-2 py-1.5 ${active ? "bg-primary" : "bg-muted/60"} ${disabled ? "opacity-60" : ""}`}
          >
            <Text
              className={`font-sans text-center text-xs font-semibold ${active ? "text-primary-foreground" : "text-muted-foreground"}`}
            >
              {lbl}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
