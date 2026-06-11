// Port nativo de la utility web `.grain` (src/index.css) y de los fondos
// [background:linear-gradient(...)] de cards/héroes. La web pinta el grano con
// un ::after (SVG feTurbulence, opacity .5, mix-blend-mode overlay); aquí lo
// replica un overlay absoluto con un PNG de ruido tileado.
import { LinearGradient, type LinearGradientProps } from "expo-linear-gradient";
import { StyleSheet, type ViewProps } from "react-native";
// Image de RN (no expo-image): su ImageContentFit no tiene "repeat"; el
// resizeMode="repeat" de RN sí tilea el PNG a tamaño natural como la web.
import { Image, View } from "react-native-css/components";

// assets/images/noise.png — tile 128x128 gris+alfa generado con un one-off de
// Python stdlib (zlib+struct, seed 2026): por píxel gris U(0,255) y alfa
// U(0,1)·0.35·255. Equivale al SVG web (feTurbulence fractalNoise
// baseFrequency .85 + rect opacity .35): la opacity del rect queda horneada en
// el canal alfa y la del ::after (0.5) va en el style del overlay.
const noise = require("../assets/images/noise.png");

const styles = StyleSheet.create({
  // El ::after web: mix-blend-mode va aquí como style prop porque ImageStyle
  // no lo tipa (solo ViewStyle) y react-native-css no compila mix-blend-mode
  // (un className mix-blend-overlay se dropearía en silencio).
  grainOverlay: {
    position: "absolute",
    inset: 0,
    opacity: 0.5,
    mixBlendMode: "overlay",
    pointerEvents: "none",
  },
  noiseTile: { width: "100%", height: "100%" },
});

/**
 * Panel con textura de grano: equivalente del patrón web
 * `<div className="grain relative overflow-hidden rounded-… border … bg-…">`.
 * Como en la web, el contenedor NO fija borde/fondo/radio/padding: cada call
 * site los pasa por className igual que su contraparte web. overflow-hidden sí
 * va siempre aquí: en RN no existe el border-radius:inherit del ::after, el
 * recorte del tile a las esquinas redondeadas depende del contenedor.
 */
export function GrainCard({
  className,
  children,
  ...rest
}: ViewProps & { className?: string }) {
  return (
    <View className={`relative overflow-hidden ${className ?? ""}`} {...rest}>
      {children}
      {/* Último hijo: pinta encima del contenido, como el ::after web —
          excepto contenido con z-index explícito (labels del Shell, badge del
          avatar), que en la web pinta sobre el grano y aquí quedaría debajo. */}
      <View style={styles.grainOverlay}>
        <Image source={noise} resizeMode="repeat" style={styles.noiseTile} />
      </View>
    </View>
  );
}

/**
 * Fondo degradado absoluto: equivalente de la clase arbitraria web
 * `[background:linear-gradient(...)]`. Va como PRIMER hijo de un GrainCard (o
 * cualquier View relativo) para quedar bajo el contenido y bajo el grano.
 * Uso: `<GradientFill {...gradients.prizeBanner} />`.
 */
export function GradientFill({ style, ...rest }: LinearGradientProps) {
  return (
    <LinearGradient
      style={[StyleSheet.absoluteFill, style]}
      {...rest}
      // Tras el spread: un fill decorativo nunca debe interceptar toques,
      // ni aunque un call site pase pointerEvents por rest.
      pointerEvents="none"
    />
  );
}

/*
 * Pares web → native de los gradientes existentes. Colores oklch convertidos a
 * #RRGGBBAA con lightningcss (el mismo compilador que convierte los tokens de
 * global.css), targets chrome 80. Ángulo CSS θ → start/end: vector
 * (sin θ, −cos θ) centrado en la caja unitaria (start = 0.5 − v/2,
 * end = 0.5 + v/2). Es una aproximación: CSS alarga la línea del gradiente
 * según el aspect ratio del elemento, pero a estos ángulos suaves el resultado
 * es visualmente equivalente.
 */
export const gradients = {
  // src/routes/Home.tsx hero:
  // linear-gradient(160deg, oklch(0.3 0.06 174 / 0.7), oklch(0.24 0.04 166 / 0.4))
  hero: {
    colors: ["#00372cb3", "#09251b66"],
    start: { x: 0.33, y: 0.03 },
    end: { x: 0.67, y: 0.97 },
  },
  // src/components/bits.tsx PrizeBanner:
  // linear-gradient(100deg, oklch(0.32 0.06 84 / 0.55), oklch(0.28 0.04 70 / 0.35))
  prizeBanner: {
    colors: ["#4130078c", "#36251259"],
    start: { x: 0.01, y: 0.41 },
    end: { x: 0.99, y: 0.59 },
  },
  // src/routes/Personal.tsx card "alive":
  // linear-gradient(100deg, oklch(0.32 0.08 150 / 0.5), oklch(0.26 0.04 160 / 0.3))
  aliveCard: {
    colors: ["#093e1b80", "#112a1d4d"],
    start: { x: 0.01, y: 0.41 },
    end: { x: 0.99, y: 0.59 },
  },
} as const;
