// Port nativo de src/components/BracketView.tsx (SEN-25, Tarea D). Bracket
// eliminatorio como rondas en columnas con scroll horizontal. Espejo
// estructural con las MISMAS clases que la web, con las salvedades del port:
//   - bracket vacío → card punteada con la copia exacta de la web (mismo View+
//     Text que EmptyTile, pero con el padding/copy del estado vacío del web);
//   - `overflow-x-auto` + `-mx-4 px-4` (sangrado) → <ScrollView horizontal> con
//     el padding expresado en contentContainerStyle (paddingHorizontal:16,
//     gap:12); NUNCA márgenes negativos; `no-scrollbar` →
//     showsHorizontalScrollIndicator={false};
//   - `min-w-[10.5rem]` → `min-w-[168px]` (10.5rem * 16);
//   - `gold-ring` (box-shadow web) NO compila en uniwind → se aproxima solo con
//     `border-gold/40` (el halo lo resuelve el controlador en QA final);
//   - `divide-y` / `border-l` self-stretch → bordes explícitos (border-t /
//     border-l) en los Views (RN no tiene divide-*);
//   - la bandera es un HERMANO flex, nunca dentro de <Text>; todo texto en
//     <Text> con su clase de fuente explícita.
import type { MundialData } from "@convex/types";
import { ScrollView, Text, View } from "react-native";

import { TeamFlag } from "@/components/TeamCard";

type BracketMatch = MundialData["bracket"][number]["matches"][number];
type Side = BracketMatch["home"];

function SideRow({
  side,
  win,
  showOwners,
}: {
  side: Side;
  win: boolean;
  showOwners: boolean;
}) {
  if (!side) {
    return (
      <View className="flex-row items-center gap-1.5 px-2.5 py-2">
        <Text className="text-[0.7rem] font-sans italic text-muted-foreground">
          Por definir
        </Text>
      </View>
    );
  }
  return (
    <View
      className={`flex-row items-center justify-between gap-2 px-2.5 py-2 ${
        win ? "bg-alive/10" : ""
      }`}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
        <TeamFlag flag={side.team.flag} name={side.team.name} className="text-base leading-none" />
        <Text
          className={`text-xs font-sans ${
            win ? "font-bold text-foreground" : "font-medium text-foreground"
          }`}
        >
          {side.team.code}
        </Text>
        {showOwners ? (
          <Text
            numberOfLines={1}
            className="shrink text-[0.65rem] font-sans text-muted-foreground"
          >
            · {side.owner}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Score({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <Text className="px-2 font-heading text-sm font-bold tabular-nums text-foreground">
      {value}
    </Text>
  );
}

function MatchCard({
  m,
  isFinal,
  showOwners,
}: {
  m: BracketMatch;
  isFinal: boolean;
  showOwners: boolean;
}) {
  const finished = m.status === "finished";
  const homeWin =
    finished && m.homeScore != null && m.awayScore != null && m.homeScore > m.awayScore;
  const awayWin =
    finished && m.homeScore != null && m.awayScore != null && m.awayScore > m.homeScore;

  return (
    <View
      className={`overflow-hidden rounded-xl border bg-card ${
        isFinal ? "border-gold/40" : "border-border"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1">
          <SideRow side={m.home} win={homeWin} showOwners={showOwners} />
          <View className="border-t border-border/60">
            <SideRow side={m.away} win={awayWin} showOwners={showOwners} />
          </View>
        </View>
        {m.homeScore != null || m.awayScore != null ? (
          <View className="shrink-0 flex-col items-center self-stretch border-l border-border/60 bg-muted/30">
            <View className="flex-1 flex-row items-center">
              <Score value={m.homeScore} />
            </View>
            <View className="flex-1 flex-row items-center border-t border-border/60">
              <Score value={m.awayScore} />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function BracketView({
  bracket,
  showOwners = true,
}: {
  bracket: MundialData["bracket"];
  showOwners?: boolean;
}) {
  if (bracket.length === 0) {
    return (
      <View className="rounded-2xl border border-dashed border-border px-4 py-10">
        <Text className="text-center text-sm font-sans text-muted-foreground">
          🗓️ El bracket se llenará cuando terminen los grupos.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {bracket.map((round) => {
          const isFinal = round.stage === "final";
          return (
            <View
              key={round.stage}
              className="min-w-[168px] flex-col justify-center gap-3"
            >
              <Text
                className={`text-center text-[0.65rem] font-sans font-bold tracking-[0.1em] uppercase ${
                  isFinal ? "text-gold" : "text-muted-foreground"
                }`}
              >
                {isFinal ? "🏆 " : ""}
                {round.label}
              </Text>
              {/* key={i} intencional: BracketMatch no tiene id estable; espeja la fuente web. */}
              {round.matches.map((m, i) => (
                <MatchCard
                  key={i}
                  m={m}
                  isFinal={isFinal}
                  showOwners={showOwners}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>
      <Text className="mt-1 pr-1 text-right text-[0.65rem] font-sans text-muted-foreground">
        desliza →
      </Text>
    </View>
  );
}
