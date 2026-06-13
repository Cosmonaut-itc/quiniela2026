// Port nativo de la Vista Torneo clásica (SEN-25, Tarea H). Espejo de
// src/routes/Mundial.tsx: vista adaptativa del torneo — tabla de posiciones en
// formato liga (kind "league"), grupos + bracket con pestañas en eliminatorios
// (kind "brackets"). Read-only y público: no recibe token (la ruta
// app/q/[id]/torneo.tsx pasa sólo quinielaId).
//
// Salvedades del port nativo (decididas en el spec):
//   - El LoadingState con skeletons de la web → <Cargando/> (mismo patrón que el
//     resto de vistas nativas; los skeletons no se portan aquí).
//   - El ui/tabs de la web → control segmentado custom con useState (NO los Tabs
//     de heroui-native). heroui Tabs es reanimated-backed con un contexto de
//     medición de layout que es delicado bajo jest y visualmente; el ui/tabs de
//     la web ya es un componente custom fino, y este app ya usa un patrón
//     segmentado custom en BottomNav, así que lo espejamos. Sólo monta el panel
//     activo (como la web), y la única state es el toggle síncrono `tab` en el
//     handler del press → sin concerns de set-state-in-effect.
//   - Sin persistencia de tokens en esta vista: la dueña del token es el
//     BottomNav, y Mundial no pasa tokens (sus otros tabs caen al fallback de
//     SecureStore, lo esperado y correcto). No hay nada que persistir.
import { useQuery } from "convex/react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { BracketView } from "@/components/BracketView";
import { Cargando } from "@/components/Pantalla";
import { GroupsView } from "@/components/GroupsView";
import { Shell, BottomNav } from "@/components/Shell";
import { StandingsView } from "@/components/StandingsView";

type Props = { quinielaId: string };

export function VistaTorneo({ quinielaId }: Props) {
  const data = useQuery(api.mundial.getTorneo, {
    quinielaId: quinielaId as Id<"quinielas">,
  });

  // tab: control segmentado del panel grupos/bracket (sólo se usa en kind
  // "brackets"). Es seguro declararlo antes del gate de carga: el orden de hooks
  // se mantiene estable (useQuery → useState) en todos los renders.
  const [tab, setTab] = useState<"grupos" | "bracket">("grupos");

  if (data === undefined) return <Cargando />;

  // Sin meToken/joinToken aquí: los otros tabs del BottomNav caen al fallback de
  // SecureStore (esperado y correcto para la vista pública del torneo).
  const bottomNav = (
    <BottomNav id={quinielaId} active="mundial" tournament={data.tournament} />
  );

  // Header (web <header className="mb-1 flex items-center gap-2">). El emoji va
  // en su propio <Text> (no cascada de fuente en RN).
  const header = (
    <View className="mb-1 flex-row items-center gap-2">
      <Text className="font-sans text-2xl leading-none">🌍</Text>
      <Text
        numberOfLines={1}
        className="font-heading text-2xl font-extrabold text-foreground"
      >
        {data.tournament.shortName}
      </Text>
    </View>
  );

  if (data.kind === "league") {
    return (
      <Shell bottomNav={bottomNav}>
        {header}
        <Text className="mb-4 font-sans text-sm text-muted-foreground">
          Tabla de posiciones del torneo.
        </Text>
        <StandingsView standings={data.standings} />
      </Shell>
    );
  }

  return (
    <Shell bottomNav={bottomNav}>
      {header}
      <Text className="mb-4 font-sans text-sm text-muted-foreground">
        {data.showOwners
          ? "Cada equipo lleva la cara de su dueño."
          : "Grupos, posiciones y bracket del torneo."}
      </Text>

      {/* Control segmentado (web TabsList = h-10 w-full rounded-xl bg-muted/60
          p-1). Dos triggers de ancho igual; el activo recibe bg-primary (la
          pastilla) directo en el Pressable y su label text-primary-foreground
          (web TabsTrigger activo = bg-primary text-primary-foreground). */}
      <View
        className="h-10 flex-row rounded-xl bg-muted/60 p-1"
        accessibilityRole="tablist"
      >
        <Pressable
          className={`flex-1 items-center justify-center rounded-lg ${
            tab === "grupos" ? "bg-primary" : ""
          }`}
          accessibilityRole="tab"
          accessibilityLabel="Grupos"
          accessibilityState={{ selected: tab === "grupos" }}
          onPress={() => setTab("grupos")}
        >
          <Text
            className={`font-sans text-sm font-semibold ${
              tab === "grupos" ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Grupos
          </Text>
        </Pressable>
        <Pressable
          className={`flex-1 items-center justify-center rounded-lg ${
            tab === "bracket" ? "bg-primary" : ""
          }`}
          accessibilityRole="tab"
          accessibilityLabel="Bracket"
          accessibilityState={{ selected: tab === "bracket" }}
          onPress={() => setTab("bracket")}
        >
          <Text
            className={`font-sans text-sm font-semibold ${
              tab === "bracket" ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            Bracket
          </Text>
        </Pressable>
      </View>

      {/* Sólo el panel activo se monta (espeja TabsContent de la web). */}
      <View className="mt-4">
        {tab === "grupos" ? (
          <GroupsView groups={data.groups} showOwners={data.showOwners} />
        ) : (
          <BracketView bracket={data.bracket} showOwners={data.showOwners} />
        )}
      </View>
    </Shell>
  );
}
