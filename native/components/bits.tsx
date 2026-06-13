// Port nativo de los primitivos de presentación de src/components/bits.tsx:
// SectionHeading, PrizeBanner, EmptyTile, ErrorCard. Mismas clases que la web
// (los tokens viven en native/global.css), con las salvedades del port nativo:
//   - todo texto va en <Text> con su clase de fuente explícita (no hay cascada
//     CSS en RN);
//   - la salvedad de la fuente solo aplica a `font-heading font-semibold` (ahí
//     `font-semibold` se remapearía a una FAMILIA y perdería Bricolage); sobre
//     texto `font-sans`, `font-semibold` (Sora SemiBold/600) es el port fiel,
//     así que el título del PrizeBanner usa font-sans font-semibold como la web;
//   - el `grain` + degradado del PrizeBanner se montan con <GrainCard> +
//     <GradientFill {...gradients.prizeBanner}> (Grain.tsx) en vez de la clase
//     web `[background:linear-gradient(...)]`.
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { GradientFill, GrainCard, gradients } from "@/components/Grain";

/** Etiqueta de sección en mayúsculas y con tracking (web <h2> → <Text>). */
export function SectionHeading({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Text
      className={`mt-6 mb-2.5 px-1 text-[0.7rem] font-sans font-bold tracking-[0.14em] text-muted-foreground uppercase ${className}`}
    >
      {children}
    </Text>
  );
}

/** Banner dorado del premio: `🏆 {title}` con subline opcional. */
export function PrizeBanner({ title, subline }: { title: string; subline?: string }) {
  if (!title) return null;
  return (
    <GrainCard className="mt-4 flex-row items-center gap-2.5 rounded-2xl border border-gold/30 px-4 py-3">
      {/* Primer hijo: el degradado pinta bajo el contenido (y bajo el grano). */}
      <GradientFill {...gradients.prizeBanner} />
      <Text className="font-sans text-xl leading-none">🏆</Text>
      <View className="min-w-0">
        <Text className="font-sans font-semibold text-sm text-gold">{title}</Text>
        {subline ? (
          <Text className="font-sans text-xs text-gold/70">{subline}</Text>
        ) : null}
      </View>
    </GrainCard>
  );
}

/** Tile pequeño con borde punteado, estado "vacío / en espera". */
export function EmptyTile({ children }: { children: ReactNode }) {
  return (
    <View className="rounded-2xl border border-dashed border-border px-4 py-3">
      <Text className="text-center font-sans text-xs text-muted-foreground">
        {children}
      </Text>
    </View>
  );
}

/** Card de error centrada para queries fallidas / no encontradas. */
export function ErrorCard({ message }: { message: string }) {
  return (
    <View className="mx-auto mt-20 max-w-sm rounded-2xl border border-border bg-card p-6">
      <Text className="text-center font-sans text-3xl">🚫</Text>
      <Text className="mt-2 text-center font-sans text-sm text-muted-foreground">
        {message}
      </Text>
    </View>
  );
}
