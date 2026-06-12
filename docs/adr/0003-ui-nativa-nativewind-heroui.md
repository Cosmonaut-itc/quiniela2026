# UI nativa con Uniwind (Tailwind v4) + HeroUI Native

El port a Expo debe conservar la identidad visual "estadio nocturno" (tokens oklch, clase `grain`, gradientes, Bricolage Grotesque/Sora) sin reinventar la UI. El engine de estilos es Uniwind (Tailwind v4 para RN, free tier MIT) y la capa de primitivos interactivos (Dialog, Tabs, Menu, Toast) es HeroUI Native — el rol que en web cumplen Base UI/shadcn, que no existen en React Native. Los tokens y convenciones de clase de `src/index.css` se reúsan casi tal cual.

## Enmienda (2026-06-11)

La decisión original era **NativeWind v5** como engine, asumiendo que convivía con HeroUI Native. Al implementar SEN-23 se verificó con fuentes primarias que la premisa era falsa: heroui-native@1.0.4 importa `uniwind` en runtime (8 módulos, sin build alternativo ni abstracción de engine), y uniwind y react-native-css/nativewind son mutuamente excluyentes en Metro (ambos pisan el `transformerPath` único sin encadenarse; el resolver de uniwind redirige todos los imports de `react-native`). Había dos salidas, ambas viables con evidencia:

- **Migrar el engine a Uniwind y conservar HeroUI Native** (elegida): uniwind está hoy más sano que nativewind v5 (estable, cadencia semanal vs preview), su rem default ya es 16 (paridad web), compila los oklch tal cual, y HeroUI aporta 39 componentes animados que aceleran el port de pantallas. Costo: re-verificar la paridad ya aprobada bajo el engine nuevo (hecho: tokens, fuentes, grain y `expo export` verificados bajo uniwind) y convivir con el dialecto de tokens de HeroUI (su `--accent` ≈ nuestro `--primary`).
- **Conservar nativewind v5 y reemplazar HeroUI por `@rn-primitives` headless + `sonner-native`** (plan B documentado): spike probado en simulador (dialog/tabs/toast con nuestros tokens vía `asChild`/`styled()`, export OK). Es la salida natural si uniwind o HeroUI se estancan: preserva el engine y construye la capa estilizada espejando `src/components/ui/*`.

## Considered Options

- **Tamagui u otro design system**: descartado — abandona Tailwind; cada estilo del web habría que traducirlo a otro sistema (mínimo reuso).
- **NativeWind + primitivos a mano sobre Modal/Pressable**: descartado — es exactamente el "reinventar" que queríamos evitar.
- **NativeWind v5 + HeroUI Native** (la decisión original): inviable — engines mutuamente excluyentes (ver enmienda).

## Consequences

- Lo que el CSS web no puede expresar en RN se resuelve con piezas nativas puntuales: gradientes → expo-linear-gradient, `grain` → overlay de ruido (imagen), fuentes → expo-font.
- Dos capas de primitivos conviven en el repo (Base UI en web, HeroUI Native en nativo); los componentes de dominio (TeamCard, PredictMatchRow…) se portan uno a uno manteniendo nombres y estructura.
- Los invariantes del wrapper de uniwind en Metro (wrapper más externo, cssEntryFile relativo a cwd, d.ts generado, pins exactos de tailwindcss/uniwind en lockstep) viven documentados en `native/metro.config.js`.
- uniwind free no compila animaciones por className (`transition-*`, `animate-*`) ni `group-*`/`mix-blend-*`: animaciones puntuales van con Reanimated o style props (la versión Pro es de pago y no corre en Expo Go).
