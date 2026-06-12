// Demo DESECHABLE (la reemplaza el port real de vistas): gemela de la vista
// Join web (src/routes/Join.tsx) renderizando la quiniela sembrada
// "E2E Fijo Regresión" de coordinated-caribou-264, con los MISMOS textos que
// muestra la web y las MISMAS strings de clase de Join.tsx / bits.tsx /
// PlayersTable.tsx / Shell.tsx. Los datos van hardcodeados: la paridad visual
// se juzga lado a lado contra la captura web con contenido idéntico.
//
// Adaptaciones inevitables (documentadas en cada sitio):
//   div→View, flex→flex-row (RN es column por default), herencia de fuente→
//   font-sans/font-semibold explícito por <Text>, tracking em→px (uniwind
//   resuelve em contra el root em de 16, no contra el font-size del elemento),
//   grain→<GrainCard>, [background:linear-gradient]→<GradientFill>,
//   bg-pitch/radiales del body/ChevronDown→piezas SVG locales,
//   glow-primary/shadow-xl→shadowProps de iOS, ring-1→border.
import { Button } from "heroui-native";
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { GradientFill, GrainCard, gradients } from "@/components/Grain";

/*
 * Literales oklch→hex convertidos con lightningcss (targets chrome 80), igual
 * que los pares de components/Grain.tsx:
 *   --primary  oklch(0.66 0.19 268)        → #6288ff
 *   --muted-foreground oklch(0.74 0.03 158) → #9cb1a4
 *   body radial 1 oklch(0.4 0.12 268 / .5)  → #2c4188 α.5
 *   body radial 2 oklch(0.5 0.14 174 / .32) → #00765f α.32
 *   body radial 3 oklch(0.55 0.1 90 / .16)  → #886e1f α.16
 *   .bg-pitch oklch(1 0 0 / 0.035)          → rgba(255,255,255,0.035)
 */
const PRIMARY_HEX = "#6288ff";
const MUTED_FOREGROUND_HEX = "#9cb1a4";

const styles = StyleSheet.create({
  // .glow-primary web: box-shadow 0 0 30px -8px oklch(0.66 0.19 268 / 0.8).
  // RN no tiene spread negativo: blur 30 − spread 8 ≈ shadowRadius 11.
  glowPrimary: {
    shadowColor: PRIMARY_HEX,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 11,
  },
  // shadow-xl de Tailwind (dos capas negras al 10%): aproximada en una capa.
  navShadow: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  stripe: { backgroundColor: "rgba(255,255,255,0.035)" },
});

/**
 * Las tres capas radiales del body web (src/index.css @layer base):
 *   radial-gradient(120% 80% at 50% -10%, oklch(0.4 0.12 268/.5), transparent 60%)
 *   radial-gradient(90% 60% at 90% 8%, oklch(0.5 0.14 174/.32), transparent 55%)
 *   radial-gradient(80% 60% at 8% 100%, oklch(0.55 0.1 90/.16), transparent 55%)
 * En CSS la primera capa pinta ENCIMA → aquí el indigo se dibuja al final.
 * background-attachment: fixed → SVG absoluto a pantalla, bajo el scroll.
 */
function StadiumGlow() {
  const { width: w, height: h } = useWindowDimensions();
  return (
    <Svg
      width={w}
      height={h}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient
          id="glow-gold"
          gradientUnits="userSpaceOnUse"
          cx={0.08 * w}
          cy={h}
          rx={0.8 * w}
          ry={0.6 * h}
        >
          <Stop offset="0" stopColor="#886e1f" stopOpacity={0.16} />
          <Stop offset="0.55" stopColor="#886e1f" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient
          id="glow-teal"
          gradientUnits="userSpaceOnUse"
          cx={0.9 * w}
          cy={0.08 * h}
          rx={0.9 * w}
          ry={0.6 * h}
        >
          <Stop offset="0" stopColor="#00765f" stopOpacity={0.32} />
          <Stop offset="0.55" stopColor="#00765f" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient
          id="glow-indigo"
          gradientUnits="userSpaceOnUse"
          cx={0.5 * w}
          cy={-0.1 * h}
          rx={1.2 * w}
          ry={0.8 * h}
        >
          <Stop offset="0" stopColor="#2c4188" stopOpacity={0.5} />
          <Stop offset="0.6" stopColor="#2c4188" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={w} height={h} fill="url(#glow-gold)" />
      <Rect width={w} height={h} fill="url(#glow-teal)" />
      <Rect width={w} height={h} fill="url(#glow-indigo)" />
    </Svg>
  );
}

/**
 * .bg-pitch web: repeating-linear-gradient(90deg, oklch(1 0 0/.035) 0 14px,
 * transparent 14px 28px). Sin repeating-gradient en RN: franjas w-3.5 (14px)
 * con hueco de 14px, recortadas por el overflow-hidden del GrainCard.
 */
function PitchStripes() {
  const { width } = useWindowDimensions();
  const count = Math.ceil(width / 28);
  return (
    <View className="absolute inset-0 flex-row" pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="mr-3.5 w-3.5" style={styles.stripe} />
      ))}
    </View>
  );
}

/**
 * ChevronDown de lucide (size-3.5 = 14px) dibujado con su mismo path 24x24.
 * El Collapsible web abre por default y rota el ícono 180°
 * (group-data-[panel-open]:rotate-180), así que en el estado capturado
 * apunta hacia ARRIBA: path "m6 9 6 6 6-6" espejado verticalmente.
 */
function ChevronDown() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path
        d="m6 15 6-6 6 6"
        stroke={MUTED_FOREGROUND_HEX}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** EmptyTile de src/components/bits.tsx: mismas clases, texto al <Text>. */
function EmptyTile({ children }: { children: string }) {
  return (
    <View className="rounded-2xl border border-dashed border-border px-4 py-3">
      <Text className="text-center font-sans text-xs text-muted-foreground">
        {children}
      </Text>
    </View>
  );
}

/** Item del BottomNav de src/components/Shell.tsx (mismas clases del span). */
function NavItem({
  emoji,
  label,
  active = false,
}: {
  emoji: string;
  label: string;
  active?: boolean;
}) {
  return (
    <View className="relative flex-1">
      {active && (
        <View
          className="absolute inset-0 rounded-xl bg-primary"
          style={styles.glowPrimary}
        />
      )}
      <View className="z-10 flex-col items-center gap-0.5 rounded-xl py-2">
        <Text className="text-base leading-none">{emoji}</Text>
        {/* web: text-[0.7rem] font-semibold; tracking normal */}
        <Text
          className={
            active
              ? "font-sans font-semibold text-[0.7rem] text-primary-foreground"
              : "font-sans font-semibold text-[0.7rem] text-muted-foreground"
          }
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

export default function Index() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      <StadiumGlow />
      {/* Shell web: columna max-w-md px-4 pb-28; aquí el px-4 va por sección
          porque el header es full-bleed (-mx-4 en la web). */}
      <ScrollView className="flex-1" contentContainerClassName="pb-28">
        {/* Header de Join.tsx: "grain bg-pitch header-safe relative -mx-4
            overflow-hidden rounded-b-3xl border-b border-border px-4 pb-6".
            header-safe → paddingTop: inset superior + 2rem (32). */}
        <GrainCard
          className="rounded-b-3xl border-b border-border px-4 pb-6"
          style={{ paddingTop: insets.top + 32 }}
        >
          <PitchStripes />
          <View className="flex-row items-center gap-3.5">
            {/* avatar fallback: "flex size-14 shrink-0 items-center
                justify-center rounded-2xl bg-secondary text-3xl ring-1
                ring-border" — ring-1 → border (RN no tiene ring/box-shadow). */}
            <View className="size-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-secondary">
              <Text className="text-3xl">🏟️</Text>
            </View>
            {/* min-w-0 → flex-1 para que truncate funcione en RN */}
            <View className="flex-1">
              {/* h1: "truncate font-heading text-2xl font-extrabold
                  tracking-tight" — tracking-tight=-0.025em → -0.6px a 24px */}
              <Text
                numberOfLines={1}
                className="font-heading font-extrabold text-2xl tracking-[-0.6px] text-foreground"
              >
                E2E Fijo Regresión
              </Text>
              <Text className="mt-0.5 font-sans text-sm text-muted-foreground">
                0 de 10 lugares ·{" "}
                <Text className="text-foreground/70">
                  Inscripciones abiertas
                </Text>
              </Text>
            </View>
          </View>
          {/* PrizeBanner de bits.tsx: "grain relative mt-4 flex items-center
              gap-2.5 overflow-hidden rounded-2xl border border-gold/30 px-4
              py-3 [background:linear-gradient(100deg,…)]" */}
          <GrainCard className="mt-4 flex-row items-center gap-2.5 rounded-2xl border border-gold/30 px-4 py-3">
            <GradientFill {...gradients.prizeBanner} />
            <Text className="text-xl leading-none">🏆</Text>
            <View className="flex-1">
              <Text className="font-sans font-semibold text-sm text-gold">
                $5,000 al campeón
              </Text>
            </View>
          </GrainCard>
        </GrainCard>

        <View className="px-4">
          {/* Encabezado colapsable de PlayersTable.tsx: "group mt-6 mb-2.5
              flex w-full items-center justify-between gap-2 px-1 text-[0.7rem]
              font-bold tracking-[0.14em] text-muted-foreground uppercase" —
              tracking 0.14em a 11.2px → 1.57px */}
          <View className="mt-6 mb-2.5 flex-row items-center justify-between gap-2 px-1">
            <Text className="font-sans font-bold text-[0.7rem] tracking-[1.57px] text-muted-foreground uppercase">
              Tabla de jugadores · 0
            </Text>
            <ChevronDown />
          </View>
          {/* space-y-2.5 → gap-2.5 */}
          <View className="gap-2.5">
            <EmptyTile>Aún no se inscribe nadie. ¡Sé el primero!</EmptyTile>
            <EmptyTile>＋ 10 lugares libres · esperando jugador</EmptyTile>
          </View>

          {/* Link al Mundial de Join.tsx: "mt-6 flex items-center
              justify-between rounded-2xl border border-border bg-card px-4
              py-3.5 text-sm font-semibold" */}
          <View className="mt-6 flex-row items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5">
            <View className="flex-row items-center gap-2">
              <Text className="text-lg">🌍</Text>
              <Text className="font-sans font-semibold text-sm text-foreground">
                Ver grupos y bracket del Mundial
              </Text>
            </View>
            <Text className="font-sans font-semibold text-sm text-muted-foreground">
              →
            </Text>
          </View>

          {/* CTA de Join.tsx: <Button size="lg" className="glow-primary mt-6
              h-12 w-full rounded-2xl text-base font-bold"> — aquí el primary
              de HeroUI Native (su bg-accent = nuestro --primary indigo), que
              en md ya es h-12; label en Sora bold como la web. */}
          <Button
            variant="primary"
            className="mt-6 h-12 w-full rounded-2xl"
            style={styles.glowPrimary}
          >
            <Button.Label className="font-sans font-bold text-base text-primary-foreground">
              ⚽ Unirme a la quiniela
            </Button.Label>
          </Button>
        </View>
      </ScrollView>

      {/* BottomNav de Shell.tsx: "fixed inset-x-0 bottom-0" + contenedor
          "px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]" + carta "grain
          relative grid grid-cols-3 overflow-hidden rounded-2xl border
          border-border bg-popover/85 p-1.5 shadow-xl backdrop-blur-xl".
          grid-cols-3 → flex-row con hijos flex-1; backdrop-blur no existe en
          RN (nada scrollea debajo en esta captura). */}
      <View
        className="absolute right-0 bottom-0 left-0 px-4"
        style={{ paddingBottom: Math.max(12, insets.bottom) }}
      >
        <GrainCard
          className="flex-row rounded-2xl border border-border bg-popover/85 p-1.5"
          style={styles.navShadow}
        >
          <NavItem emoji="👤" label="Mi panel" />
          <NavItem emoji="📋" label="General" active />
          <NavItem emoji="🌍" label="Mundial" />
        </GrainCard>
      </View>
    </View>
  );
}
