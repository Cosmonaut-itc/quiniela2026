# Fase 2: Port a Expo iOS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Prerequisito:** Fase 1 (multi-torneo) fusionada y desplegada. Este plan asume el schema/queries post-Fase 1 (`getTorneo`, `tournaments.list`, `currentRonda`, etc.).

**Goal:** App Expo iOS en `native/` con paridad funcional y visual con la webapp (ambos modos, multi-torneo), distribuida por TestFlight, con Universal Links y push nativo.

**Architecture:** Un backend, dos clientes (ADR-0002): `native/` importa `../convex` vía metro `watchFolders` + tsconfig paths; identidad por tokens en SecureStore; rutas Expo Router espejo de las web para que el mismo link funcione en ambas. UI con NativeWind v5 (Tailwind v4) + HeroUI Native (ADR-0003). Push: canal Expo Notifications conviviendo con web-push.

**Tech Stack:** Expo SDK (último estable), Expo Router, NativeWind v5/react-native-css, HeroUI Native, expo-secure-store, expo-image-picker, expo-notifications, expo-linear-gradient, expo-font, EAS Build/Submit, Maestro.

**Skills de apoyo durante la ejecución** (invocar con el Skill tool en la task indicada): `expo:building-native-ui`, `expo:expo-tailwind-setup`, `heroui-native`, `expo:expo-dev-client`, `expo:expo-deployment`.

---

## Estructura de archivos (objetivo)

```
native/
├── app.json                  # config Expo: bundle id, associatedDomains, scheme
├── package.json
├── metro.config.js           # watchFolders: ../convex, ../shared
├── tsconfig.json             # paths a ../convex/_generated y ../shared
├── global.css                # tokens oklch portados de src/index.css
├── app/
│   ├── _layout.tsx           # ConvexProvider + fuentes + tema + Toaster
│   ├── index.tsx             # Home (crear quiniela)
│   └── q/[id]/
│       ├── join/[token].tsx  # Join | ProgolGeneral (ruteo por getMode)
│       ├── me/[token].tsx    # Personal | ProgolPersonal
│       ├── admin/[token].tsx # Admin | ProgolAdmin
│       ├── torneo.tsx        # Vista Torneo adaptativa
│       └── mundial.tsx       # alias → redirect a torneo
├── components/               # port 1:1 de src/components (mismos nombres)
└── lib/                      # storage (SecureStore), push, convex client
shared/
├── format.ts                 # movido de src/lib (formatMXN, whenLabel…)
├── personalLink.ts           # movido de src/lib
└── *.test.ts                 # sus tests existentes, sin cambios de aserciones
```

---

### Task 1: Extraer `shared/` (helpers puros web↔native)

**Files:**
- Create: `shared/format.ts`, `shared/personalLink.ts` (movidos desde `src/lib/`)
- Modify: imports en `src/` que los usan; `tsconfig.app.json` (path `@shared/*`); `vite.config.ts` (alias)

- [ ] **Step 1:** Mover `src/lib/format.ts` y `src/lib/personalLink.ts` (con sus `.test.ts`) a `shared/`, sin cambios de contenido. Son módulos puros sin imports de DOM/react (verificar con `grep -n "import" shared/*.ts` — si `format.ts` importa algo de `src/`, dejar ese pedazo en un wrapper web).
- [ ] **Step 2:** Alias `@shared`: en `vite.config.ts` añadir `"@shared": path.resolve(__dirname, "shared")` a `resolve.alias`; en `tsconfig.app.json` el path equivalente. Actualizar los imports en `src/` (`@/lib/format` → `@shared/format`, `@/lib/personalLink` → `@shared/personalLink`).
- [ ] **Step 3:** Run: `npx vitest run && npm run lint && npx tsc -b` — Expected: PASS (mismos tests, nueva ruta).
- [ ] **Step 4:** Commit: `git commit -m "refactor: helpers puros a shared/ para reuso web y native"`

---

### Task 2: Scaffold de la app Expo en `native/`

**Files:**
- Create: `native/` completo (create-expo-app), `native/metro.config.js`, `native/lib/convex.ts`, `native/app/_layout.tsx`

- [ ] **Step 1:** Invocar la skill `expo:building-native-ui` como referencia y crear la app:

```bash
cd /Users/felixddhs/VSCODE/REPOS/quiniela2026
npx create-expo-app@latest native --template default
cd native && npx expo install convex expo-secure-store
```

- [ ] **Step 2:** Monorepo informal (ADR-0002) — `native/metro.config.js`:

```js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
const repoRoot = path.resolve(__dirname, "..");
// La app importa ../convex (API generada) y ../shared (helpers puros).
config.watchFolders = [path.join(repoRoot, "convex"), path.join(repoRoot, "shared")];
config.resolver.nodeModulesPaths = [path.join(__dirname, "node_modules")];
module.exports = config;
```

y en `native/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"],
      "@convex/*": ["../convex/*"],
      "@shared/*": ["../shared/*"]
    }
  }
}
```

- [ ] **Step 3:** Cliente y provider — `native/lib/convex.ts`:

```ts
import { ConvexReactClient } from "convex/react";

export const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});
```

`native/.env.local`: `EXPO_PUBLIC_CONVEX_URL=<URL del deployment dev>` (mismo backend que la web; prod se inyecta en EAS).

`native/app/_layout.tsx`:

```tsx
import { Stack } from "expo-router";
import { ConvexProvider } from "convex/react";
import { convex } from "@/lib/convex";

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0d1f1a" } }} />
    </ConvexProvider>
  );
}
```

- [ ] **Step 4:** Smoke: `native/app/index.tsx` provisional que haga `useQuery(api.tournaments.list, {})` (import `api` desde `@convex/_generated/api`) y liste los nombres en `<Text>`.

Run: `cd native && npx expo start --ios`
Expected: simulador muestra los 12 torneos — la tubería repo-compartido→Convex funciona.

- [ ] **Step 5:** Commit: `git commit -m "feat(native): scaffold Expo con Convex compartido vía metro watchFolders"`

---

### Task 3: Estilos — NativeWind v5 + tokens estadio nocturno + fuentes

**Files:**
- Create: `native/global.css`, `native/components/Grain.tsx`
- Modify: `native/app/_layout.tsx`, configs que indique la skill

- [ ] **Step 1:** Invocar la skill `expo:expo-tailwind-setup` y seguirla para instalar NativeWind v5/react-native-css con Tailwind v4 en `native/`.
- [ ] **Step 2:** Portar los tokens: copiar de `src/index.css` el bloque `@theme`/`:root` (colores oklch `--background`, `--card`, `--primary`, `--color-gold`, `--color-alive`, `--color-eliminated`, radios, etc.) a `native/global.css`. Mantener LOS MISMOS nombres de token para que las clases (`bg-card`, `text-gold`, `border-border`) sean idénticas a las del web.
- [ ] **Step 3:** Fuentes:

```bash
npx expo install expo-font @expo-google-fonts/bricolage-grotesque @expo-google-fonts/sora
```

En `_layout.tsx`, cargar con `useFonts` y mapear en Tailwind: `font-heading` → BricolageGrotesque, fuente body → Sora. Pantalla de splash hasta `fontsLoaded`.

- [ ] **Step 4:** Efecto `grain` (no existe CSS noise en RN) — `native/components/Grain.tsx`:

```tsx
import { Image } from "expo-image";
import { View, type ViewProps } from "react-native";

// Overlay de ruido: equivalente nativo de la clase web `grain`.
// assets/noise.png: tile 128x128 transparente con ruido fino (exportar uno).
export function GrainCard({ className, children, ...rest }: ViewProps & { className?: string }) {
  return (
    <View className={`relative overflow-hidden rounded-3xl border border-border bg-card ${className ?? ""}`} {...rest}>
      <Image source={require("../assets/noise.png")} contentFit="repeat"
        style={{ position: "absolute", inset: 0, opacity: 0.06 }} pointerEvents="none" />
      {children}
    </View>
  );
}
```

Gradientes: `npx expo install expo-linear-gradient`; donde el web usa `[background:linear-gradient(...)]`, en native se envuelve en `<LinearGradient colors={[...]} …>` con los mismos oklch convertidos (anotar el par web→native en el componente).

- [ ] **Step 5:** Verificar: pantalla index provisional con un `GrainCard` y texto `font-heading text-gold` — comparar contra la web al lado.

Run: `npx expo start --ios`
Expected: tarjeta indistinguible del estilo web.

- [ ] **Step 6:** Commit: `git commit -m "feat(native): NativeWind v5 con tokens estadio nocturno, fuentes y grain"`

---

### Task 4: HeroUI Native (primitivos) + identidad (SecureStore)

**Files:**
- Create: `native/lib/storage.ts`
- Modify: `native/app/_layout.tsx` (provider/Toaster de HeroUI)

- [ ] **Step 1:** Invocar la skill `heroui-native` y seguir su instalación/tematización. Tema: mapear a los tokens de Task 3 (estadio nocturno, un solo tema oscuro).
- [ ] **Step 2:** `native/lib/storage.ts` — misma semántica de claves que la web (`src/lib/storage.ts`):

```ts
import * as SecureStore from "expo-secure-store";

// Claves idénticas a la web: quiniela:${id}:me / quiniela:${id}:join.
// SecureStore (Keychain) porque los tokens SON la identidad (ADR-0002).
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, "_");

export async function getToken(quinielaId: string, kind: "me" | "join"): Promise<string | null> {
  return SecureStore.getItemAsync(safe(`quiniela:${quinielaId}:${kind}`));
}
export async function setToken(quinielaId: string, kind: "me" | "join", token: string): Promise<void> {
  await SecureStore.setItemAsync(safe(`quiniela:${quinielaId}:${kind}`), token);
}
export async function clearToken(quinielaId: string, kind: "me" | "join"): Promise<void> {
  await SecureStore.deleteItemAsync(safe(`quiniela:${quinielaId}:${kind}`));
}
```

- [ ] **Step 3:** Test del wrapper (lógica de saneo de claves) con vitest en `shared/` si se extrae pura, o smoke en app. Commit: `git commit -m "feat(native): HeroUI Native tematizado e identidad en SecureStore"`

---

### Task 5: Rutas espejo + deep links (tracer bullet: Join)

**Files:**
- Create: `native/app/q/[id]/join/[token].tsx`, `native/app/q/[id]/me/[token].tsx`, `native/app/q/[id]/admin/[token].tsx`, `native/app/q/[id]/torneo.tsx`, `native/app/q/[id]/mundial.tsx`
- Modify: `native/app.json`

- [ ] **Step 1:** `app.json`: `"scheme": "quiniela"`, `"ios": { "bundleIdentifier": "com.felixddhs.quiniela2026" }`.
- [ ] **Step 2:** Tracer bullet — `native/app/q/[id]/join/[token].tsx` portando el ruteo por modo de `src/routes/Join.tsx` (la web decide Join vs ProgolGeneral con `api.quinielas.getMode`):

```tsx
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { JoinClasica } from "@/components/views/JoinClasica";
import { ProgolGeneral } from "@/components/views/ProgolGeneral";

export default function JoinRoute() {
  const { id, token } = useLocalSearchParams<{ id: string; token: string }>();
  const mode = useQuery(api.quinielas.getMode, { id: id as Id<"quinielas"> });
  if (!mode) return null; // splash/skeleton
  return mode.gameMode === "progol"
    ? <ProgolGeneral quinielaId={id} joinToken={token} />
    : <JoinClasica quinielaId={id} joinToken={token} />;
}
```

Las otras 3 rutas siguen el mismo patrón espejo de `src/main.tsx` (me→Personal/ProgolPersonal, admin→Admin/ProgolAdmin, torneo→VistaTorneo). `mundial.tsx` es `<Redirect href={…/torneo} />`.

- [ ] **Step 3:** Probar el deep link en simulador:

```bash
npx uri-scheme open "quiniela://q/<ID_SEMBRADO>/join/<JOIN_TOKEN>" --ios
```

(joinToken de dev: 2º hash en `npx convex data quinielas` — memoria del repo). Expected: abre la vista Join con datos reales.

- [ ] **Step 4:** Commit: `git commit -m "feat(native): rutas espejo con deep links y tracer bullet de Join"`

---

### Task 6: Universal Links (AASA + associated domains)

**Files:**
- Create: `public/.well-known/apple-app-site-association` (web)
- Modify: `native/app.json`

- [ ] **Step 1:** AASA en la web (Railway la sirve desde `dist/`):

```json
{
  "applinks": {
    "apps": [],
    "details": [
      { "appID": "<TEAM_ID>.com.felixddhs.quiniela2026", "paths": ["/q/*"] }
    ]
  }
}
```

(`TEAM_ID` desde el Apple Developer Portal.) Verificar que `serve` lo sirve: `npm run build && npm run start` y `curl -i http://localhost:3000/.well-known/apple-app-site-association` → 200 `application/json`. Si `serve -s` reescribe a index.html, añadir en `railway.json`/`serve.json` la regla para servir ese path tal cual.

- [ ] **Step 2:** `native/app.json`: `"ios": { …, "associatedDomains": ["applinks:<dominio-producción>"] }`.
- [ ] **Step 3:** Desplegar la web (para que la AASA esté pública). La verificación end-to-end real solo funciona con build firmado (Task 10); dejar anotado probarlo ahí: tocar un link `https://<dominio>/q/…` en Notas del iPhone → abre la app.
- [ ] **Step 4:** Commit: `git commit -m "feat(native): universal links con AASA servida por la web"`

---

### Task 7: Port de componentes y vistas (Clásica + Progol + Home)

**Files:**
- Create: `native/components/*` y `native/components/views/*` (mapeo abajo)

Orden de port (de hoja a raíz; cada bloque = sub-task con commit propio). Regla general de conversión: `div→View`, `span/p/h*→Text` (en RN TODO texto va en `<Text>`), `button→Pressable` o Button de HeroUI, `img→expo-image`, `onClick→onPress`, dialogs/menus/tabs/toast→HeroUI Native, clases Tailwind se conservan (mismos tokens), gradientes→LinearGradient, `grain`→`GrainCard` (Task 3).

| # | Web (`src/…`) | Native (`native/…`) | Notas |
|---|---|---|---|
| 7.1 | `components/bits.tsx` | `components/bits.tsx` | SectionHeading, PrizeBanner, EmptyTile |
| 7.2 | `components/Avatar.tsx`, `EditableAvatar.tsx` | idem | picker: ver código abajo |
| 7.3 | `components/TeamCard.tsx`, `PlayerRow.tsx`, `DuelRow.tsx`, `Leaderboard.tsx`, `PredictMatchRow.tsx` | idem | `TeamFlag` respeta emoji vs URL (Fase 1) |
| 7.4 | `components/GroupsView.tsx`, `BracketView.tsx`, `StandingsView.tsx` | idem | tablas → View rows (RN no tiene `<table>`) |
| 7.5 | `components/Shell.tsx`, `BottomNav.tsx` | `components/Shell.tsx` + tabs | Shell usa `SafeAreaView`; BottomNav → tab bar propia (mismos 3 tabs, label = shortName del torneo) |
| 7.6 | `routes/Join.tsx`, `Personal.tsx`, `Admin.tsx`, `Mundial.tsx` | `components/views/…` | mismas queries Convex, mismos estados |
| 7.7 | `routes/progol/*` | `components/views/…` | incluye navegación por Ronda (Fase 1) |
| 7.8 | `routes/Home.tsx` | `app/index.tsx` | selector de torneo + creación |
| 7.9 | diálogo "recuperar panel" (BottomNav) | idem | usa `@shared/personalLink` |

- [ ] **Step 7.2 (código de referencia del bloque más distinto del web)** — subida de foto en native (`EditableAvatar`): el flujo Convex es el mismo (`generateUploadUrl` → POST → `photoId`), cambia el picker:

```tsx
import * as ImagePicker from "expo-image-picker";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

export function usePhotoUpload() {
  const generateUploadUrl = useMutation(api.quinielas.generateUploadUrl);
  async function pickAndUpload(): Promise<string | null> {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1],
    });
    if (res.canceled) return null;
    const asset = res.assets[0];
    const url = await generateUploadUrl();
    const blob = await (await fetch(asset.uri)).blob();
    const upload = await fetch(url, {
      method: "POST", headers: { "Content-Type": asset.mimeType ?? "image/jpeg" }, body: blob,
    });
    const { storageId } = await upload.json();
    return storageId as string;
  }
  return { pickAndUpload };
}
```

(instalar: `npx expo install expo-image-picker`).

- [ ] **Para cada sub-task 7.1–7.9:** portar; verificar lado a lado contra la web en `npm run dev` (mismos datos del backend dev); componente crítico con test RNTL si tiene lógica condicional (p. ej. PredictMatchRow: estados pendiente/pronosticado/bloqueado/resultado); commit atómico `feat(native): port de <bloque>`.

---

### Task 8: Push nativo (backend + app)

**Files:**
- Modify: `convex/schema.ts`, `convex/notifications.ts`, `convex/push.ts`
- Create: `native/lib/usePushSubscription.ts`
- Test: `convex/notifications.test.ts` (añadir), `convex/push.test.ts` (añadir)

- [ ] **Step 1 (test backend):** `savePushSubscription` acepta el canal Expo:

```ts
// convex/notifications.test.ts — añadir
it("guarda una suscripción expo y deliver la enruta al Expo Push API", async () => {
  const t = convexTest(schema);
  // seed: quiniela + participante (helper existente del describe de notificaciones)
  await t.mutation(api.notifications.savePushSubscription, {
    personalToken: "<token del seed>",
    kind: "expo",
    expoPushToken: "ExponentPushToken[xxx]",
  });
  await t.run(async (ctx) => {
    const [sub] = await ctx.db.query("pushSubscriptions").collect();
    expect(sub).toMatchObject({ kind: "expo", expoPushToken: "ExponentPushToken[xxx]" });
  });
});
```

- [ ] **Step 2 (schema):** en `pushSubscriptions`, `endpoint/p256dh/auth` pasan a opcionales y se añade:

```ts
    kind: v.optional(v.union(v.literal("webpush"), v.literal("expo"))), // ausente = webpush (legacy)
    expoPushToken: v.optional(v.string()),
```

  con índice `.index("by_expoToken", ["expoPushToken"])`.
- [ ] **Step 3 (mutations):** `savePushSubscription` acepta `kind` + `expoPushToken` (validar `ExponentPushToken[`-prefijo) como alternativa a endpoint/keys; dedupe por `expoPushToken`. `removePushSubscription` igual.
- [ ] **Step 4 (delivery):** en `convex/push.ts` `deliver`, bifurcar por `kind`:

```ts
const expoSubs = subs.filter((s) => s.kind === "expo" && s.expoPushToken);
if (expoSubs.length > 0) {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(expoSubs.map((s) => ({
      to: s.expoPushToken, title, body, data: { url },
    }))),
  });
  const { data } = await res.json();
  // tickets con status "error" + DeviceNotRegistered → prune igual que el 410 de webpush
}
```

  (los webpush siguen su rama actual intacta).
- [ ] **Step 5 (app):** `native/lib/usePushSubscription.ts` espejo del hook web:

```ts
import * as Notifications from "expo-notifications";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

export function usePushSubscription(args: { personalToken?: string; adminToken?: string }) {
  const save = useMutation(api.notifications.savePushSubscription);
  async function enable(): Promise<boolean> {
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return false;
    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync();
    await save({ ...args, kind: "expo", expoPushToken });
    return true;
  }
  return { enable };
}
```

  Port de `PushOptIn.tsx` usándolo; tap en notificación navega con `router.push(data.url)` (handler en `_layout.tsx` con `Notifications.addNotificationResponseReceivedListener`). Instalar: `npx expo install expo-notifications`. Nota: el token real exige dev build (no Expo Go) — Task 9.
- [ ] **Step 6:** Run: `npx vitest run convex/notifications.test.ts convex/push.test.ts && npx tsc -b` — Expected: PASS. Commit: `git commit -m "feat(push): canal Expo Notifications junto a web-push"`

---

### Task 9: Dev build en dispositivo

- [ ] **Step 1:** Invocar la skill `expo:expo-dev-client`. `npx expo install expo-dev-client`, `eas init` (cuenta Expo), `eas build --profile development --platform ios` con el Apple ID del Developer Program (ya activo).
- [ ] **Step 2:** Instalar en iPhone, `npx expo start --dev-client`; smoke completo: crear quiniela → compartir link → unirse → pronosticar → push de prueba (`https://expo.dev/notifications` con el token impreso).
- [ ] **Step 3:** Commit de configs EAS: `git commit -m "chore(native): dev client y perfiles EAS"`

---

### Task 10: E2E Maestro

**Files:**
- Create: `native/.maestro/join-and-predict.yaml`, `native/.maestro/create-quiniela.yaml`

- [ ] **Step 1:** Instalar Maestro (`curl -fsSL https://get.maestro.mobile.dev | bash`).
- [ ] **Step 2:** Flow principal (`join-and-predict.yaml`):

```yaml
appId: com.felixddhs.quiniela2026
---
- launchApp
- openLink: "quiniela://q/${QUINIELA_ID}/join/${JOIN_TOKEN}"
- assertVisible: "Unirse"
- tapOn: "Unirse"
- inputText: "Maestro Test"
- tapOn: "Confirmar"
- assertVisible: "Mi panel"
```

(IDs/tokens sembrados se inyectan por env: `maestro test -e QUINIELA_ID=… -e JOIN_TOKEN=… native/.maestro/join-and-predict.yaml`; los textos exactos de los botones se ajustan al port real.)

- [ ] **Step 3:** Run: `maestro test native/.maestro/` contra simulador con backend dev sembrado. Expected: PASS. Commit.

---

### Task 11: TestFlight

- [ ] **Step 1:** Invocar la skill `expo:expo-deployment`. Assets: icono/splash desde `public/icon-512.png` (fondo `#0d1f1a`).
- [ ] **Step 2:** `eas build --profile production --platform ios` (env `EXPO_PUBLIC_CONVEX_URL` = prod `resilient-shrimp-254`) y `eas submit --platform ios`.
- [ ] **Step 3:** Verificar Universal Links con el build firmado (link de WhatsApp → abre app); invitar testers internos; smoke en TestFlight.
- [ ] **Step 4:** Actualizar README (sección app iOS) y commit final.

---

## Self-review checklist (ya aplicado)

- Paridad de superficie: 5 rutas × 2 modos ✔ (Task 5+7), creación ✔ (7.8), avatar/fotos ✔ (7.2), notas/pagos/correcciones en Admin ✔ (7.6), notificaciones in-app + push ✔ (Task 8), recuperación de panel ✔ (7.9), multi-torneo ✔ (asume Fase 1).
- Lo que NO se porta (decidido): PWA/manifest/service worker (N/A nativo), web-push en native (lo sustituye Expo), next-themes (tema único).
- Dependencias entre tasks: 1→2→3→4→5→7; 6 y 8 pueden ir en paralelo tras 5; 9→10→11 al final.
- Riesgos anotados: AASA con `serve -s` (rewrite a index.html — verificar en Task 6 Step 1); tokens push reales solo en dev build (no Expo Go); oklch en NativeWind v5 — si el parser no lo soporta, convertir tokens a hex con el mismo nombre (cambio local a `native/global.css`).
