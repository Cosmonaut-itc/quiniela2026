// Port nativo de src/components/StatusBadge.tsx. Pill de estado festivo
// compartido por la tabla de jugadores y el header personal:
//   champion → oro 🏆 · out → rojo "Fuera" · pending → ⏳ "En espera" ·
//   alive → verde "● Vivo" (default). `label` sobreescribe el texto.
//
// La web usa el shadcn <Badge> (un <span> con cva). Aquí se porta como un pill
// inline (<View rounded-full> + <Text>) con las mismas clases base del Badge
// web (h-5 px-2 py-0.5 text-xs, rounded-full ≈ rounded-4xl) — sin meter una
// primitiva de heroui, para igualar el visual web exactamente y mantener los
// tests ligeros. El `.gold-ring` del estado champion (box-shadow oro de
// src/index.css) no es reproducible como utility en uniwind; se aproxima con un
// borde oro (border-gold/40), que es la parte visible load-bearing del anillo.
import type { PlayerStatus } from "@convex/types";
import { Text, View } from "react-native";

// Clases base del shadcn Badge web (badge.tsx): pill de altura fija, centrado.
const BASE =
  "h-5 shrink-0 flex-row items-center justify-center gap-1 self-start overflow-hidden rounded-full border border-transparent px-2 py-0.5";
const LABEL = "font-sans font-semibold text-xs";

export function StatusBadge({
  status,
  label,
  className = "",
}: {
  status: PlayerStatus;
  label?: string;
  className?: string;
}) {
  if (status === "pending") {
    return (
      <View className={`${BASE} bg-muted ${className}`}>
        <Text className={`${LABEL} text-muted-foreground`}>
          ⏳ {label ?? "En espera"}
        </Text>
      </View>
    );
  }
  if (status === "champion") {
    return (
      <View className={`${BASE} border-gold/40 bg-gold/15 ${className}`}>
        <Text className={`${LABEL} text-gold`}>🏆 {label ?? "Campeón"}</Text>
      </View>
    );
  }
  if (status === "out") {
    return (
      <View className={`${BASE} bg-eliminated/15 ${className}`}>
        <Text className={`${LABEL} text-eliminated`}>{label ?? "Fuera"}</Text>
      </View>
    );
  }
  return (
    <View className={`${BASE} bg-alive/15 ${className}`}>
      <View
        testID="status-dot"
        className="mr-0.5 size-1.5 rounded-full bg-alive"
      />
      <Text className={`${LABEL} text-alive`}>{label ?? "Vivo"}</Text>
    </View>
  );
}
