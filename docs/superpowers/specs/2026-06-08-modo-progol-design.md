# Diseño — Modo Progol (quiniela de pronósticos)

**Fecha:** 2026-06-08
**Estado:** Borrador para revisión del usuario.
**Idioma:** Español (UI, docs y commits).
**Specs base:**
- `docs/superpowers/specs/2026-06-06-quiniela-mundial-design.md` (modo clásico, ownerships, mundial).
- `docs/superpowers/specs/2026-06-06-premio-por-participacion-design.md` (premio fijo / por persona — se reutiliza tal cual).
- `docs/superpowers/specs/2026-06-06-notificaciones-design.md` (pipeline de avisos in-app + push — se extiende).

## 1. Contexto y problema

Hoy una quiniela es de un solo tipo: se reparten los **48 equipos** entre N participantes
(tabla `ownerships`, `assignMode` on_join/on_reveal) y **gana el dueño del equipo campeón**. El estado
(vivos, etapa, campeón) se **deriva en lectura** por quiniela vía `resolveQuiniela` (con overrides
por quiniela), y un cron cada 5 min (`sync.syncMatches`) sincroniza partidos desde football-data,
recalcula estados, autocierra quinielas y dispara avisos (`detectFromSync`).

**Idea nueva:** un segundo **modo de juego** estilo *Progol*: en vez de repartir equipos, **cada
jugador pronostica 1/X/2** (local / empate / visitante) en los partidos disponibles. **Cada acierto = 1
punto**; gana quien acumule más puntos. **Sin límite de jugadores**. Los partidos se **desbloquean**
conforme se definen los rivales (grupos desde el inicio; eliminatorias al cuajar el bracket), y se
**avisa** a los jugadores cuando hay nuevos partidos por pronosticar. Hay **leaderboard**, se pueden
**ver los pronósticos propios y los de los demás**, y se **mantiene la pestaña Mundial**.

## 2. Mecánica confirmada (decisiones del usuario)

| Tema | Decisión |
|---|---|
| **Nombre** | "Progol" en la UI; valor interno `gameMode: "progol"`. El actual pasa a llamarse "Clásica". |
| **Pronóstico** | 1/X/2 por partido (`pick: "home" \| "draw" \| "away"`). |
| **Puntos** | 1 punto por acierto, todos los partidos valen igual. Gana el de más puntos. |
| **Bloqueo** | Cada partido es **editable hasta su saque** (`kickoffAt`); al iniciar, el pronóstico se congela. |
| **Ver a otros** | **Siempre visibles** (transparencia total; sin ocultar hasta el cierre). |
| **Eliminatorias** | Mismo 1/X/2 **por marcador**; un partido definido en penales cuenta como **empate (X)**. |
| **Inscripción** | **Sin límite** de jugadores, pero se **cierra al primer partido del Mundial** (cohorte fija), igual que el autocierre clásico. |
| **Premio** | Mismos dos modos que hoy (`fixed` / `per_person`); el premio es **para el líder** del leaderboard. |

**Regla de resultado 1/X/2** (uniforme grupos + eliminatorias): se compara el **marcador efectivo**
(con overrides) del partido terminado: `home > away → "home"`, `away > home → "away"`,
`home == away → "draw"`. En eliminatoria a penales el marcador queda empatado, así que cuenta como
"draw" (X), aunque exista un clasificado. (No se usa `winnerTeamId` para puntuar; el pronóstico es del
**marcador**, no de quién avanza.)

## 3. Alcance

**Incluye:**
- Tercer "selector" en creación (junto a premio y reparto): **Modo de juego** → Clásica / Progol.
- Campo `gameMode` en `quinielas` (aditivo, legacy = clásica) y tabla nueva `predictions`.
- Lógica pura `convex/lib/progol.ts` (resultado 1/X/2, partido pronosticable, estado UI, leaderboard,
  detección de etapas desbloqueadas) — testeable en aislamiento.
- Módulo `convex/progol.ts`: `getGeneral` (leaderboard), `getPersonal`/`getCard` (pronósticos propios y
  de otros), `predict`, `getAdmin`, `closeRegistration`; más `quinielas.getMode` para el ruteo.
- Ramas mínimas en `createQuiniela`, `joinQuiniela`, `autoCloseDue`, `detectFromSync`, `getMundial`.
- Front: selector en `Home`, ruteo por modo en `Join`/`Personal`/`Admin`/`Mundial`, sub-vistas progol
  (leaderboard, panel de pronósticos editable, panel de admin) y Mundial sin caras de dueño.
- Reúso del premio fijo/por persona, pagos (`PaymentStatusMenu`), avisos + push, `Shell`/`BottomNav`,
  `Avatar`, `GroupsView`/`BracketView`, `prizeBanner`.
- Tests TDD (unit puro + convex-test + front) y validación Playwright.

**No incluye (trabajo futuro):**
- Puntos ponderados por etapa, bonus por marcador exacto, o pronóstico de "quién avanza".
- Ocultar pronósticos ajenos hasta el cierre (se eligió transparencia total).
- Cambiar de modo después de crear la quiniela.
- Recordatorio push "no has pronosticado y el partido empieza pronto" (posible fase 2).
- Desempate automático del ganador final (ver §9: empate = colíderes, lo resuelve el admin).

## 4. Modelo de datos

**4.1 `quinielas` (aditivo):**

```ts
quinielas: defineTable({
  // ...campos existentes...
  gameMode: v.optional(v.string()), // "clasica" | "progol"; ausente = "clasica" (legacy)
  // ...
})
```

Helper `gameModeOf(qn)` (análogo a `modeOf`/`prizeModeOf`): ausente o `"clasica"` → `"clasica"`.

En modo **progol**, al crear se guarda:
- `gameMode: "progol"`.
- `numParticipants: 0` → **centinela de "sin límite"** (en clásica sigue siendo 2–48). Las vistas
  muestran `filledCount` inscritos sin "de N".
- `slotSizes: []` (no hay reparto de equipos).
- `assignMode` irrelevante (se guarda el default `"on_join"`, nunca se usa en progol).
- `prizeMode`/`entryFee`/`notes`/`photoId` igual que hoy.

**4.2 Tabla nueva `predictions`:**

```ts
predictions: defineTable({
  quinielaId: v.id("quinielas"),
  participantId: v.id("participants"),
  matchId: v.id("matches"),
  pick: v.union(v.literal("home"), v.literal("draw"), v.literal("away")),
  updatedAt: v.number(),
})
  .index("by_quiniela_participant", ["quinielaId", "participantId"]) // panel del jugador + (con prefijo quinielaId) todo el leaderboard
  .index("by_quiniela_match", ["quinielaId", "matchId"])             // todos los pronósticos de un partido
```

- **Una sola fila por (quiniela, participante, partido)**; `predict` hace upsert (busca por
  `by_quiniela_participant` y filtra `matchId` en memoria — un jugador tiene ≤ ~104 picks).
- El leaderboard lee todos los picks de la quiniela con el prefijo `quinielaId` de
  `by_quiniela_participant`.
- `predictions` **no se borra** al revertir; solo se actualiza el `pick`.

## 5. Lógica pura — `convex/lib/progol.ts`

Funciones puras (sin `ctx`), espejo de `lib/tournament.ts` / `lib/notify.ts`, fáciles de testear:

```ts
export type Pick = "home" | "draw" | "away";

/** 1/X/2 por marcador efectivo; null si el partido no terminó o no hay marcador. */
export function matchResult(m: { status: string; homeScore: number | null; awayScore: number | null }): Pick | null;

/** ¿Pronosticable AHORA? Ambos equipos definidos, programado y antes del saque. */
export function isPredictable(
  m: { homeTeamId: string | null; awayTeamId: string | null; status: string; kickoffAt: number },
  now: number,
): boolean;

export type MatchUiState = "pending" | "predictable" | "locked" | "finished";
/** pending = falta rival (eliminatoria sin definir) · predictable = editable ·
 *  locked = ya empezó, sin resultado final · finished = terminado (con marcador). */
export function matchUiState(m: MatchRow, now: number): MatchUiState;

export type LeaderRow = { participantId: string; points: number; correct: number; played: number; rank: number };
/** points = correct = aciertos. played = # de partidos terminados (con resultado) en los que
 *  el jugador puso pick. rank = dense rank por points desc (empates comparten lugar). */
export function leaderboard(
  participants: { id: string }[],
  picks: { participantId: string; matchId: string; pick: Pick }[],
  results: Map<string, Pick>, // matchId -> resultado, solo partidos terminados con marcador
): LeaderRow[];

/** Etapas de eliminatoria cuyos partidos YA tienen ambos equipos definidos (para avisar). */
export function unlockedKnockoutStages(
  effMatches: { stage: string; homeTeamId: string | null; awayTeamId: string | null }[],
): string[]; // p.ej. ["r32","r16"]; nunca incluye "group"
```

El puntaje y el resultado usan **`effRows`** (marcador efectivo con overrides por quiniela), de modo
que si el admin corrige un marcador en su quiniela, el leaderboard lo respeta — consistente con todo lo
demás. El **bloqueo** del pronóstico (`predict`) usa el partido **global** (`kickoffAt`/`status`).

## 6. Backend — `convex/progol.ts` y ramas mínimas

### 6.1 Ruteo: `quinielas.getMode`
```ts
getMode({ id: v.id("quinielas") }) -> { gameMode: "clasica" | "progol" }
```
Query barata (lee la quiniela por id). El front la usa para elegir qué sub-query/sub-vista montar.

### 6.2 Creación: rama en `quinielas.createQuiniela`
Arg nuevo `gameMode: v.optional(v.string())`. Si `"progol"`: `numParticipants = 0`, `slotSizes = []`,
`assignMode = "on_join"` (ignorado); premio/notas/foto como hoy. Si ausente/`"clasica"`: idéntico a hoy.

### 6.3 Inscripción: rama en `participants.joinQuiniela`
Si la quiniela es progol: exige `status === "open"`, crea el `participant` (nombre + foto +
`personalToken` + `slotIndex = k` + `joinedAt`), **sin tope y sin reparto** de equipos; emite
`playerJoinedNotice` al admin; regresa `personalToken`. Si es clásica: comportamiento actual (tope,
draw on_join/on_reveal, avisos).

### 6.4 `progol.predict`
```ts
predict({ personalToken, matchId, pick }) -> { ok: true }
```
Valida: jugador existe; su quiniela es progol; el partido **global** tiene ambos equipos definidos,
`status === "scheduled"` y `now < kickoffAt`; `pick ∈ {home,draw,away}`. **Upsert** de la fila
`(quinielaId, participantId, matchId)`. Si el partido ya cerró/empezó → error claro
("Ese partido ya cerró"). Editable cuantas veces se quiera antes del saque.

### 6.5 `progol.getGeneral` (leaderboard) → `ProgolGeneralData`
```ts
type ProgolGeneralData = {
  mode: "progol";
  quiniela: { name; photoUrl; prize: PrizeView; status: "open"|"locked"|"finished"; filledCount; notes };
  leaderboard: { participantId; name; photoUrl; points; correct; played; rank }[]; // ordenado
  decidedMatches: number; // partidos terminados con resultado
  winnerParticipantIds: string[]; // si finished: líder(es); empate = varios
};
```
`status` derivado: `open` (inscripción abierta) → `locked` (cerrada, final no jugada) → `finished`
(el partido `stage:"final"` está terminado). `prize` vía `prizeView` (igual que clásica).

### 6.6 `progol.getPersonal` / `progol.getCard` → `ProgolCardData`
Misma forma para "mis pronósticos" (token propio, editable en UI) y "ver a otro" (read-only):
```ts
type ProgolCardData = {
  mode: "progol";
  quinielaId; quinielaName; joinToken; prize; status;
  who: { participantId; name; photoUrl; points; rank; correct; played };
  stages: {
    stage; label;
    matches: {
      matchId; home: TeamLite | null; away: TeamLite | null; kickoffAt;
      state: "pending" | "predictable" | "locked" | "finished";
      pick: Pick | null;              // pick del DUEÑO de la tarjeta (mío en getPersonal, suyo en getCard)
      result: Pick | null;            // si finished
      correct: boolean | null;        // si finished y había pick
      homeScore: number | null; awayScore: number | null;
    }[];
  }[];
};
```
- `getPersonal({ personalToken })` → tarjeta del propio jugador.
- `getCard({ joinToken, participantId })` → tarjeta de cualquiera (read-only; siempre visible).
Las etapas se ordenan grupos → r32 → r16 → qf → sf → third → final (reusa `STAGE_LABEL`).

### 6.7 Admin: `progol.getAdmin` + `progol.closeRegistration`
`getAdmin({ adminToken })` → como `AdminData` pero `participants[].teamCount` se sustituye por
`points`/`played`; mismo bloque `matches` (reusa el mapeo de `getAdmin` para que el admin pueda
**corregir marcadores** con `setMatchResultManual`/`clearMatchOverride`, que ya existen y aplican por
quiniela); `prize` + `methodCounts` para gestión de pagos con `PaymentStatusMenu` (reúso total).
`closeRegistration({ adminToken })` → patch `status:"locked"` (cierre manual de inscripción; paralelo a
`closeAndRedistribute`, pero sin reparto).

### 6.8 Cierre de inscripción: rama en `quinielas.autoCloseDue`
El cron ya detecta "arrancó el torneo" (primer `kickoffAt`). Para quinielas **progol** abiertas: patch
`status:"locked"` (sin reparto ni redistribución). Las clásicas siguen su flujo actual.

### 6.9 Avisos: rama en `notifications.detectFromSync` + `lib/progol`
`detectFromSync` hoy salta quinielas sin `ownerships` (clásicas vacías). Se ramifica: si
`gameModeOf(qn) === "progol"`, corre detección progol (no depende de ownerships); si no, el camino
clásico actual. Intents progol (puros, en `lib/progol.ts` → `detectProgolEvents`, deduplicados por
`insertNotification`):
- **`tournament_started`** (al cerrar inscripción): "¡Arrancó el Mundial! ⚽ Pronostica los partidos
  en tu panel." A cada participante. Dedupe `${q}:tournament_started::${pid}`.
- **`predictions_unlocked`** por etapa de eliminatoria recién desbloqueada (de `unlockedKnockoutStages`):
  "¡Nuevos partidos para pronosticar! Ya puedes pronosticar los {label}." A cada participante. Dedupe
  `${q}:predictions_unlocked:${stage}:${pid}`. (Grupos NO avisan: están disponibles desde el inicio.)

El push se dispara solo (el `insertNotification` ya agenda `push.deliver`). Deep-link al panel del
jugador (ya implementado por `getForPush`).

## 7. Front

### 7.1 `Home.tsx` — selector de modo
Nuevo bloque "Modo de juego" (mismo patrón visual de 2 botones `aria-pressed` que premio/reparto), al
inicio del formulario: **Clásica** (default) / **Progol**. Estado `gameMode`. Cuando `progol`:
- **Se ocultan** "Número de participantes" y "Reparto de equipos".
- Se mantienen Premio (fijo/por persona), Notas y Foto.
- El hero/copy se adapta ("Pronostica cada partido; gana quien más acierte 🎯").
- `submit()` envía `gameMode`; en progol no manda `numParticipants` ni `assignMode`.

### 7.2 Ruteo por modo
`main.tsx` no cambia (mismas rutas). En `Join`/`Personal`/`Admin`/`Mundial` (todas tienen `:id`):
```ts
const mode = useQuery(api.quinielas.getMode, { id });
const classic = useQuery(api.<clásica>, mode === "clasica" ? { token } : "skip");
const progol  = useQuery(api.progol.<x>, mode === "progol"  ? { token } : "skip");
if (mode === undefined) return <LoadingState/>;
return mode === "progol" ? <Progol… data={progol}/> : <Clasica… data={classic}/>;
```
Una query reactiva extra (barata). La clásica queda **intacta**.

### 7.3 General (`Join`, `active="general"`) → leaderboard
`ProgolGeneral`: header (foto, nombre, "{filledCount} inscritos", `statusLabel`) + `PrizeBanner` (copy
"para el líder") + Notas + **Leaderboard** (lugar, `Avatar`, nombre, **pts**, "acertó X/Y") + link a
Mundial + **CTA Unirme** (si `status==="open"` y no inscrito en este dispositivo; sin "lugares"). Tocar
una fila del leaderboard abre un **Dialog/sheet** con la tarjeta de ese jugador (`getCard`, read-only) —
así "se ven las selecciones de los otros".

### 7.4 Mi panel (`Personal`, `active="me"`) → pronósticos editables
`ProgolPersonal`: header (Avatar + editar foto + `NotificationBell` + badge "Lugar #R · P pts" en vez de
`StatusBadge`) + `PrizeBanner` + `PushOptIn` + lista de partidos **agrupada por etapa**. Cada partido =
`PredictMatchRow` con `PickSelector` 1/X/2:
- `predictable`: selector activo; al tocar llama `progol.predict` (optimista).
- `locked`: selector congelado, muestra tu pick + "por jugar/en vivo".
- `finished`: muestra marcador, tu pick y ✓/✗ (+ punto).
- `pending`: "Rival por definir" (eliminatoria aún no desbloqueada), sin selector.
Link a Mundial al final.

### 7.5 Admin (`Admin`)
`ProgolAdmin`: cabecera + premio/bote + lista de participantes con **puntos** y `PaymentStatusMenu`
(reúso); tabla de partidos con corrección manual (reúso `setMatchResultManual`); botón **Cerrar
inscripción** (`closeRegistration`); acceso al leaderboard. Sin reparto de equipos.

### 7.6 Mundial sin dueños
`getMundial` lee `qn.gameMode` y expone `showOwners: boolean` (`false` en progol). `GroupsView` y
`BracketView` reciben `showOwners` y **ocultan** caras/nombres de dueño cuando es `false`. El resto
(posiciones, marcadores, bracket) idéntico. Se mantiene la pestaña.

### 7.7 Componentes nuevos vs. reutilizados
**Nuevos:** `PickSelector` (segmentado 1/X/2 con banderas), `PredictMatchRow`, `Leaderboard`, y los
sub-árboles `ProgolGeneral`/`ProgolPersonal`/`ProgolAdmin`.
**Reutilizados:** `Shell`, `BottomNav` (mismas 3 pestañas), `Avatar`, `PrizeBanner`/`prizeBanner`
(+ copy "al líder"), `NotificationBell`, `PushOptIn`, `PaymentStatusMenu`, `GroupsView`/`BracketView`,
`Dialog`/`Collapsible`/`Tabs`, `Button`/`Input`/`Label`/`Skeleton`.

## 8. Premio, pagos y ganador

- **Premio:** reúso total de `prizeView` + `PaymentStatusMenu`. `fixed` → texto al líder; `per_person` →
  bote = cuota × pagados (crece y se congela como hoy). Copy del banner: "para el líder" / "al líder".
- **Ganador:** el #1 del leaderboard al terminar la **final**. Empate en puntos = **colíderes**
  (comparten `rank`); no hay desempate automático — el admin reparte/decide (queda como nota).
- **`status` finished** derivado del partido `stage:"final"` terminado (no se persiste un campeón como en
  clásica; el "ganador" es el tope del leaderboard).

## 9. Compatibilidad y migración

Sin migración. `gameMode` es opcional; las filas existentes (sin él) son `"clasica"` vía `gameModeOf`,
y todo el camino clásico queda **sin tocar** salvo ramas tempranas aditivas en `createQuiniela`,
`joinQuiniela`, `autoCloseDue`, `detectFromSync` y `getMundial` (un `showOwners` derivado). La tabla
`predictions` es nueva y solo la usa progol. Los tests actuales siguen válidos.

## 10. Pruebas (TDD)

**Unit puro (`lib/progol.test.ts`):** `matchResult` (1/X/2, empate, penales = X, no terminado = null);
`isPredictable` y `matchUiState` (pending/predictable/locked/finished con `now` y equipos faltantes);
`leaderboard` (puntos = aciertos, `played`, empates comparten `rank`, orden); `unlockedKnockoutStages`
(grupos nunca, etapas con ambos equipos definidos); `detectProgolEvents` (intents + dedupe).

**Convex (`convex-test`):** `createQuiniela` progol (numParticipants 0, slotSizes []); `joinQuiniela`
progol (sin tope, sin ownerships, falla si locked); `predict` (upsert, rechazo tras kickoff / partido sin
rival / pick inválido); `getGeneral`/`getPersonal`/`getCard` (puntos, ranks, estados por partido, "ver a
otro"); `getMundial` progol (`showOwners:false`); `autoCloseDue` cierra progol al primer kickoff sin
repartir; `detectFromSync` emite `predictions_unlocked` al desbloquear una etapa (con dedupe). Quiniela
**legacy** sin `gameMode` se comporta como clásica.

**Front (vitest + Testing Library):** `PickSelector` (estado activo/disabled, callback); lógica de copy
del banner progol; ramo de `getMode` (monta la sub-vista correcta).

**E2E (Playwright):** crear quiniela **Progol**; unir 2–3 jugadores; pronosticar varios partidos; simular
resultados (override admin); verificar puntos y orden del leaderboard; abrir la tarjeta de otro jugador;
verificar Mundial sin caras de dueño.

## 11. Plan de commits (atómicos, TDD)

Orden tentativo (lo afina el plan de implementación):
1. Schema: `gameMode` en `quinielas` + tabla `predictions` + helper `gameModeOf`.
2. `lib/progol.ts` puro (resultado, pronosticable, estado UI, leaderboard, etapas, detección) — test primero.
3. `createQuiniela`: rama progol (test primero).
4. `joinQuiniela`: rama progol (test primero).
5. `progol.predict` + `quinielas.getMode` (test primero).
6. `progol.getGeneral` / `getPersonal` / `getCard` + tipos (test primero).
7. `progol.getAdmin` + `closeRegistration` (test primero).
8. `autoCloseDue` + `detectFromSync` ramas progol (test primero).
9. `getMundial` `showOwners` + `GroupsView`/`BracketView` (test primero).
10. Front: `Home` selector de modo.
11. Front: ruteo por modo + `ProgolGeneral` (leaderboard + ver a otro).
12. Front: `ProgolPersonal` + `PickSelector`/`PredictMatchRow`.
13. Front: `ProgolAdmin`.
14. Validación Playwright + ajustes finales.

## 12. Supuestos abiertos (confirmar en revisión)

- **Desempate del ganador:** colíderes comparten el primer lugar; el admin reparte el premio (sin
  desempate automático). Si prefieres un criterio (p. ej. el primero en inscribirse, o más pronósticos
  hechos), se añade al leaderboard.
- **Centinela `numParticipants = 0`** para "sin límite" en progol (en vez de volverlo opcional con
  migración). Las vistas muestran "{filledCount} inscritos".
- **Ver a otros = Dialog/sheet** desde el leaderboard (no una ruta nueva), para v1.
- **Sin recordatorio** "no has pronosticado y el partido empieza pronto" en v1 (posible fase 2).
