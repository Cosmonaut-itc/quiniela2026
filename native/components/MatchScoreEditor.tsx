// Port nativo de src/components/MatchScoreEditor.tsx. Corrige/revierte el marcador
// (y el ganador en eliminatorio) de cada partido con equipos definidos.
// RN: <Input> web → <TextInput> con color de texto EXPLÍCITO; el selector de
// Ganador reutiliza PickSelector (segmentado). Sin spinner (animate-* no compila):
// el botón se deshabilita mientras savingId === externalId.
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { AdminMatchView, Pick } from "@convex/types";
import { SectionHeading } from "@/components/bits";
import { PickSelector } from "@/components/PickSelector";
import { TeamFlag } from "@/components/TeamCard";

type Sel = Pick; // "home" | "draw" | "away"

export function MatchScoreEditor({
  matches,
  savingId,
  onSave,
  onRevert,
}: {
  matches: AdminMatchView[];
  savingId: string | null;
  onSave: (
    externalId: string,
    homeScore: number,
    awayScore: number,
    winnerExternalId: string | null | undefined,
  ) => void;
  onRevert: (externalId: string) => void;
}) {
  const [scores, setScores] = useState<Record<string, { h?: string; a?: string }>>({});
  const [winners, setWinners] = useState<Record<string, Sel>>({});

  function selectedWinner(m: AdminMatchView): Sel {
    return (
      winners[m.externalId] ??
      (m.winnerExternalId && m.winnerExternalId === m.homeExternalId
        ? "home"
        : m.winnerExternalId && m.winnerExternalId === m.awayExternalId
          ? "away"
          : "draw")
    );
  }

  function handleSave(m: AdminMatchView) {
    const s = scores[m.externalId] ?? {};
    const homeScore = Number(s.h ?? m.homeScore ?? 0);
    const awayScore = Number(s.a ?? m.awayScore ?? 0);
    let winnerExternalId: string | null | undefined = undefined;
    if (m.stage !== "group") {
      const sel = selectedWinner(m);
      winnerExternalId =
        sel === "home" ? m.homeExternalId : sel === "away" ? m.awayExternalId : null;
    }
    onSave(m.externalId, homeScore, awayScore, winnerExternalId);
  }

  function handleRevert(externalId: string) {
    setWinners((prev) => {
      const next = { ...prev };
      delete next[externalId];
      return next;
    });
    onRevert(externalId);
  }

  const playableMatches = matches.filter((m) => m.homeTeam && m.awayTeam);

  return (
    <>
      <SectionHeading>Corregir marcador</SectionHeading>
      {playableMatches.length === 0 ? (
        <View className="rounded-2xl border border-dashed border-border px-4 py-3">
          <Text className="text-center font-sans text-xs text-muted-foreground">
            No hay partidos con equipos definidos todavía.
          </Text>
        </View>
      ) : (
        <View className="gap-2.5">
          {playableMatches.map((m) => {
            const s = scores[m.externalId] ?? {};
            const saving = savingId === m.externalId;
            return (
              <View
                key={m.externalId}
                className="rounded-2xl border border-border bg-card px-3.5 py-3"
              >
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="font-sans text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {m.label}
                  </Text>
                  {m.manualOverride && (
                    <View className="flex-row items-center gap-2">
                      <Text className="font-sans text-[0.65rem] font-semibold text-gold">
                        editado a mano
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Volver al automático"
                        disabled={saving}
                        onPress={() => handleRevert(m.externalId)}
                        className={saving ? "opacity-50" : "active:opacity-70"}
                      >
                        <Text className="font-sans text-[0.65rem] font-semibold text-muted-foreground">
                          ↺ volver al automático
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                <View className="flex-row items-center gap-2">
                  <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
                    <TeamFlag flag={m.homeTeam!.flag} name={m.homeTeam!.name} className="text-lg leading-none" />
                    <Text numberOfLines={1} className="font-sans text-sm font-medium text-foreground">
                      {m.homeTeam!.code}
                    </Text>
                  </View>
                  <TextInput
                    accessibilityLabel={`Goles ${m.homeTeam!.code}`}
                    keyboardType="number-pad"
                    value={s.h ?? (m.homeScore != null ? String(m.homeScore) : "")}
                    onChangeText={(t) =>
                      setScores((prev) => ({ ...prev, [m.externalId]: { ...prev[m.externalId], h: t } }))
                    }
                    className="h-9 w-12 rounded-lg border border-border bg-muted/40 text-center font-sans text-sm text-foreground"
                  />
                  <Text className="font-sans text-muted-foreground">–</Text>
                  <TextInput
                    accessibilityLabel={`Goles ${m.awayTeam!.code}`}
                    keyboardType="number-pad"
                    value={s.a ?? (m.awayScore != null ? String(m.awayScore) : "")}
                    onChangeText={(t) =>
                      setScores((prev) => ({ ...prev, [m.externalId]: { ...prev[m.externalId], a: t } }))
                    }
                    className="h-9 w-12 rounded-lg border border-border bg-muted/40 text-center font-sans text-sm text-foreground"
                  />
                  <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1.5">
                    <Text numberOfLines={1} className="font-sans text-sm font-medium text-foreground">
                      {m.awayTeam!.code}
                    </Text>
                    <TeamFlag flag={m.awayTeam!.flag} name={m.awayTeam!.name} className="text-lg leading-none" />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Guardar marcador"
                    disabled={saving}
                    onPress={() => handleSave(m)}
                    className={`size-9 items-center justify-center rounded-lg bg-primary ${saving ? "opacity-50" : "active:opacity-80"}`}
                  >
                    <Text className="font-sans text-base text-primary-foreground">✓</Text>
                  </Pressable>
                </View>

                {m.stage !== "group" && (
                  <View className="mt-2.5">
                    <Text className="mb-1.5 font-sans text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      Ganador
                    </Text>
                    <PickSelector
                      value={selectedWinner(m)}
                      onPick={(p) => setWinners((prev) => ({ ...prev, [m.externalId]: p }))}
                      options={{ home: m.homeTeam!.code, away: m.awayTeam!.code }}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </>
  );
}
