// Port nativo de src/components/GroupsView.tsx (SEN-25, Tarea D). Espejo
// estructural con las MISMAS clases que la web (los tokens viven en
// native/global.css), con las salvedades del port:
//   - todo texto va en <Text> con su clase de fuente explícita (no hay cascada
//     CSS en RN); la bandera es un HERMANO flex, nunca dentro de un <Text>;
//   - `space-y-3` web → `gap-3` (RN no tiene space-y);
//   - la utility web `grain` → <GrainCard> (añade overflow-hidden + relative +
//     el overlay de ruido); el resto de clases (border/bg/rounded/padding) se
//     pasan por className igual que la web;
//   - el punto de color `size-1.5` es un <View> sin texto (advancing→bg-alive,
//     out→bg-eliminated, else bg-muted-foreground/40);
//   - el `cn(...)` web → plantillas de string como el resto de componentes
//     nativos (native/lib no tiene helper `cn`);
//   - el nombre del dueño se trunca con numberOfLines={1} + maxWidth (web
//     `max-w-16` = 4rem = 64px).
import type { MundialData } from "@convex/types";
import { Text, View } from "react-native";

import { Avatar } from "@/components/Avatar";
import { TeamFlag } from "@/components/TeamCard";
import { GrainCard } from "@/components/Grain";

export function GroupsView({
  groups,
  showOwners = true,
}: {
  groups: MundialData["groups"];
  showOwners?: boolean;
}) {
  return (
    <View className="gap-3">
      {groups.map((g) => (
        <GrainCard
          key={g.group}
          className="rounded-2xl border border-border bg-card px-3.5 py-3"
        >
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="font-heading text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
              Grupo {g.group}
            </Text>
            <Text className="text-[0.65rem] font-sans font-semibold tracking-wide text-muted-foreground uppercase">
              Pts
            </Text>
          </View>

          {g.rows.map((r, i) => {
            const out = !r.alive;
            const advancing = !out && i < 2;
            return (
              <View
                key={r.team.code}
                className={`flex-row items-center justify-between gap-2 border-t border-border/60 py-1.5 ${
                  i === 0 ? "border-t-0" : ""
                } ${out ? "opacity-40" : ""}`}
              >
                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                  <View
                    className={`w-1.5 h-1.5 shrink-0 rounded-full ${
                      advancing
                        ? "bg-alive"
                        : out
                          ? "bg-eliminated"
                          : "bg-muted-foreground/40"
                    }`}
                  />
                  <TeamFlag flag={r.team.flag} name={r.team.name} className="text-lg leading-none" />
                  <Text
                    numberOfLines={1}
                    className={`shrink text-sm font-sans font-medium text-foreground ${
                      out ? "line-through" : ""
                    }`}
                  >
                    {r.team.name}
                  </Text>
                  {showOwners ? (
                    <>
                      <Avatar name={r.ownerName} url={r.ownerPhotoUrl} size={18} />
                      <Text
                        numberOfLines={1}
                        style={{ maxWidth: 64 }}
                        className="text-[0.7rem] font-sans text-muted-foreground"
                      >
                        {r.ownerName}
                      </Text>
                    </>
                  ) : null}
                </View>
                <Text
                  className={`shrink-0 font-heading text-sm font-bold tabular-nums ${
                    advancing ? "text-alive" : "text-foreground/80"
                  }`}
                >
                  {r.points}
                </Text>
              </View>
            );
          })}
        </GrainCard>
      ))}

      <Text className="pt-1 text-center text-[0.7rem] font-sans text-muted-foreground">
        <Text className="text-alive">●</Text> clasifica ·{" "}
        <Text className="text-eliminated">●</Text> eliminado
      </Text>
    </View>
  );
}
