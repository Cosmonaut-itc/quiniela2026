# UI nativa con NativeWind v5 (Tailwind v4) + HeroUI Native

El port a Expo debe conservar la identidad visual "estadio nocturno" (tokens oklch, clase `grain`, gradientes, Bricolage Grotesque/Sora) sin reinventar la UI. Elegimos NativeWind v5 porque soporta Tailwind v4 y permite reusar los tokens y convenciones de clase de `src/index.css` casi tal cual, y HeroUI Native (Tailwind v4 vía Uniwind) como capa de primitivos interactivos (Dialog, Tabs, Menu, Toast) — el rol que en web cumplen Base UI/shadcn, que no existen en React Native.

## Considered Options

- **Tamagui u otro design system**: descartado — abandona Tailwind; cada estilo del web habría que traducirlo a otro sistema (mínimo reuso).
- **NativeWind + primitivos a mano sobre Modal/Pressable**: descartado — es exactamente el "reinventar" que queríamos evitar.

## Consequences

- Lo que el CSS web no puede expresar en RN se resuelve con piezas nativas puntuales: gradientes → expo-linear-gradient, `grain` → overlay de ruido (imagen), fuentes → expo-font.
- Dos capas de primitivos conviven en el repo (Base UI en web, HeroUI Native en nativo); los componentes de dominio (TeamCard, PredictMatchRow…) se portan uno a uno manteniendo nombres y estructura.
