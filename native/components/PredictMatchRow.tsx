// Port nativo de src/components/PredictMatchRow.tsx. Una fila de partido:
// marcador/fecha arriba y el control/resultado abajo según el estado
// (pending / predictable / locked / finished).
//
// Conversión web→native: div→View, span/p→Text, button→Pressable (vía
// PickSelector). No hay cascada CSS: cada <Text> lleva su clase de fuente
// (font-sans / font-heading). Una <TeamFlag> con escudo URL devuelve <Image>,
// que NO puede vivir dentro de <Text> → la fila bandera+código se compone como
// <View flex-row> con piezas hermanas. El contenedor `grain` del web se porta
// con <GrainCard> (que ya aplica relative/overflow-hidden/grano).
import type { Pick, ProgolMatchView } from "@convex/types";
import { whenLabel } from "@shared/format";
import { Text, View } from "react-native";

import { GrainCard } from "@/components/Grain";
import { PickSelector } from "@/components/PickSelector";
import { TeamFlag } from "@/components/TeamCard";

const PICK_LABEL: Record<Pick, string> = { home: "Local", draw: "Empate", away: "Visita" };

export function PredictMatchRow({
  m,
  editable,
  onPick,
}: {
  m: ProgolMatchView;
  editable: boolean;
  onPick?: (matchId: string, pick: Pick) => void;
}) {
  const homeCode = m.home?.code ?? "—";
  const awayCode = m.away?.code ?? "—";
  return (
    <GrainCard className="rounded-2xl border border-border bg-card px-3.5 py-3">
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
          {m.home ? (
            <TeamFlag flag={m.home.flag} name={m.home.name} className="text-lg leading-none" />
          ) : (
            <Text className="font-sans text-lg leading-none">❔</Text>
          )}
          <Text numberOfLines={1} className="font-sans text-sm font-medium text-foreground">
            {homeCode}
          </Text>
        </View>
        {m.state === "finished" ? (
          <Text className="font-heading text-sm font-bold tabular-nums text-foreground">
            {m.homeScore}–{m.awayScore}
          </Text>
        ) : (
          <Text className="font-sans text-[0.65rem] text-muted-foreground">
            {whenLabel(m.kickoffAt)}
          </Text>
        )}
        <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1.5">
          <Text numberOfLines={1} className="font-sans text-sm font-medium text-foreground">
            {awayCode}
          </Text>
          {m.away ? (
            <TeamFlag flag={m.away.flag} name={m.away.name} className="text-lg leading-none" />
          ) : (
            <Text className="font-sans text-lg leading-none">❔</Text>
          )}
        </View>
      </View>

      <View className="mt-2.5">
        {m.state === "pending" ? (
          <Text className="font-sans text-center text-[0.7rem] text-muted-foreground italic">
            Rival por definir
          </Text>
        ) : m.state === "finished" ? (
          <ResultLine m={m} />
        ) : (
          <PickSelector
            value={m.pick}
            disabled={!editable || m.state === "locked"}
            onPick={(p) => onPick?.(m.matchId, p)}
            options={{ home: homeCode, away: awayCode }}
          />
        )}
        {m.state === "locked" && (
          <Text className="mt-1 font-sans text-center text-[0.65rem] text-muted-foreground">
            {m.pick ? `Tu pronóstico: ${PICK_LABEL[m.pick]}` : "Sin pronóstico · partido cerrado"}
          </Text>
        )}
      </View>
    </GrainCard>
  );
}

function ResultLine({ m }: { m: ProgolMatchView }) {
  // Defensivo: un partido "finished" debería traer siempre resultado (marcador),
  // pero el tipo no lo garantiza; si faltara, mostramos el pick sin veredicto.
  if (m.result == null) {
    return (
      <Text className="font-sans text-center text-[0.7rem] text-muted-foreground">
        {m.pick == null ? "Sin resultado" : `Tu pronóstico: ${PICK_LABEL[m.pick]}`}
      </Text>
    );
  }
  if (m.pick == null) {
    return (
      <Text className="font-sans text-center text-[0.7rem] text-muted-foreground">
        No pronosticaste · resultado: {PICK_LABEL[m.result]}
      </Text>
    );
  }
  return (
    <Text
      className={`font-sans text-center text-[0.7rem] font-semibold ${m.correct ? "text-alive" : "text-eliminated"}`}
    >
      {m.correct ? "✓ Acertaste" : "✗ Fallaste"} · tu {PICK_LABEL[m.pick]}
    </Text>
  );
}
