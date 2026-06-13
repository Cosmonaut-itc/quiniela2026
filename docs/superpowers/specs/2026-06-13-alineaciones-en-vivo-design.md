# Alineaciones en vivo

**Fecha:** 2026-06-13
**Estado:** Diseño aprobado, pendiente de plan de implementación

## Problema

Un Participante quiere ver la alineación (11 inicial, formación, DT y banca) de los
partidos que se están jugando **ahora** dentro del Torneo de su Quiniela, desde la web.

La API integrada hoy (**football-data.org**, free tier) **no** expone alineaciones: el
endpoint `/v4/matches/{id}` las trae en su esquema, pero los campos `lineup`/`bench`/
`formation`/`coach` están bloqueados fuera del plan de pago *Deep Data* (~€29/mes).

## Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Fuente de datos | **API-Football** (api-sports.io v3), plan free | El endpoint de lineups está disponible en el plan free (100 req/día); ya estaba anotado como fallback en `convex/lib/footballData.ts`. |
| Persistencia | **Tabla en Convex**, no Redis | Convex ya es la base de datos, es reactiva (la web se actualiza sola) y corre el cron. Redis añadiría infra y una capa server nueva sin reducir las llamadas a la API. |
| Alcance | **Cualquier partido en vivo del Torneo**, ambos equipos, visible para todos | Lo más simple y general; encaja con "el equipo que está actualmente jugando". |
| UI | **Sección "En vivo"** arriba en la Vista Torneo, tap → sheet con alineaciones | Funciona igual en formato liga y eliminatorio; no depende de las vistas agregadas (grupos/bracket/tabla). |
| Contenido | **11 inicial + formación + DT + banca** | Todo lo que entrega UNA llamada al endpoint de lineups. Sin eventos en vivo (subs/tarjetas) para no multiplicar llamadas. |
| Reconciliación | **`live=all` + match por nombre**, con `apiFixtureId` persistido por partido | Mínimo de llamadas; sin mapa de league-IDs que mantener; cada partido se reconcilia una sola vez. |

## Restricción dura: límite de 100 req/día

El límite **no** lo resuelve la persistencia, lo resuelve la **cadencia de fetch**. Redis o
Convex son solo dónde se guarda el resultado; el número de llamadas lo decide el cron.

Política de fetch (en `syncLineups`):
- Si **no hay** partidos con `status="live"` → **0 llamadas**.
- Si los hay → **1** llamada `GET /fixtures?live=all` por ciclo (global, compartida entre
  todos los Torneos), luego **1** `GET /fixtures/lineups?fixture={id}` por cada partido
  vivo cuyo lineup **no esté aún confirmado** en cache.
- Una vez `confirmed=true`, se deja de re-pedir ese partido (el 11 ya no cambia; no
  rastreamos subs/tarjetas — fuera de alcance).

**Worst case:** 4 partidos simultáneos, ciclo de 5 min, ~3 ciclos hasta confirmar el 11 ⇒
`1 (live=all) + 4 (lineups)` × ~3 ≈ **15 llamadas**. Muy por debajo de 100/día.

## Arquitectura

```
Cron (cada 5 min)
   └─ internal.lineups.syncLineups   (internalAction)
        ├─ query matches status="live" de torneos activos   → si vacío, return (0 llamadas)
        ├─ fetchLiveFixtures(token)            → GET /fixtures?live=all      (1 llamada)
        ├─ por cada match vivo sin lineup confirmado:
        │     ├─ matchLiveFixture(match, liveFixtures)  → apiFixtureId | null
        │     ├─ fetchLineups(token, apiFixtureId)      → GET /fixtures/lineups  (1 llamada)
        │     └─ runMutation upsertLineup(...)
        └─ (la web suscrita a getLiveLineups se actualiza sola por reactividad)

Web (Vista Torneo)
   └─ useQuery(api.lineups.getLiveLineups, { quinielaId })
        └─ <LiveLineups/> : sección "En vivo" → tarjetas → Dialog con las alineaciones
```

## Componentes

### 1. Config / secreto

- Env var de Convex **`API_FOOTBALL_TOKEN`** (mismo patrón que `FOOTBALL_DATA_TOKEN` en
  `convex/sync.ts`).
- Header de autenticación: `x-apisports-key: <token>`.
- Base URL: `https://v3.football.api-sports.io`.

### 2. Esquema — tabla `lineups` (`convex/schema.ts`)

```ts
lineups: defineTable({
  matchId: v.id("matches"),
  tournamentCode: v.string(),
  apiFixtureId: v.optional(v.number()),   // cachea la reconciliación; null hasta resolver
  home: teamLineupValidator,
  away: teamLineupValidator,
  fetchedAt: v.number(),
  confirmed: v.boolean(),                  // flag de API-Football (lineup confirmado)
})
  .index("by_match", ["matchId"])
  .index("by_tournament", ["tournamentCode"]),
```

donde `teamLineupValidator` es:

```ts
v.object({
  teamId: v.optional(v.id("teams")),       // resuelto contra nuestras teams si hay match
  name: v.string(),                        // nombre tal cual lo da API-Football (fallback)
  formation: v.string(),                   // "4-3-3"; "" si la API no lo da
  coach: v.string(),                       // nombre del DT; "" si falta
  startXI: v.array(playerValidator),
  bench: v.array(playerValidator),
})
```

y `playerValidator`:

```ts
v.object({
  name: v.string(),
  number: v.optional(v.number()),
  pos: v.optional(v.string()),             // "G" | "D" | "M" | "F"
  grid: v.optional(v.string()),            // "1:1" para dibujar la formación (futuro)
})
```

**Invariante:** una sola fila por `matchId` (el upsert busca por `by_match` y hace patch o
insert, igual que `setMatchResultManual` en `matchOverrides`).

### 3. `convex/lib/apiFootball.ts` (puro, testeable — espejo de `lib/footballData.ts`)

Tipos crudos mínimos (campos opcionales porque la API los omite hasta confirmar) y:

- `mapLineups(json): { home, away }` — mapea el `response: [home, away]` de
  `/fixtures/lineups` a nuestra forma. Tolera arrays vacíos (lineup aún no publicado).
- `matchLiveFixture(match, liveFixtures): number | null` — empareja un partido nuestro con
  un fixture en vivo por **nombre de equipo normalizado** (home y away deben coincidir);
  devuelve `fixture.id` o `null`.
- `normalizeTeamName(name): string` — minúsculas, sin acentos, sin sufijos comunes ("FC",
  "CF", "AFC", "SC"), sin puntuación.
- `TEAM_ALIASES: Record<string,string>` — overrides curados para los casos que la
  normalización no resuelve (p. ej. `"man city" → "manchester city"`). Arranca pequeño y
  crece con la evidencia.
- `fetchLiveFixtures(token, deps)` / `fetchLineups(token, fixtureId, deps)` — con el mismo
  manejo de 429/`Retry-After`/retry-una-vez e inyección de `fetchFn`/`sleep` que
  `footballData.ts`.

### 4. `convex/lineups.ts`

- `internalAction syncLineups` — orquesta el ciclo descrito en *Arquitectura*. Reusa
  `internal.tournaments.activeTournamentCodes`. Errores por partido se registran
  (`console.error`) y no abortan el resto (mismo criterio que `runSyncCycle`).
- `internalMutation upsertLineup` — patch/insert por `by_match`; resuelve `teamId` contra
  `teams` por `tournamentCode`+nombre normalizado cuando se pueda (best-effort).
- `internalQuery liveMatchesNeedingLineup` — partidos `status="live"` de torneos activos
  cuyo lineup no exista o no esté `confirmed`.
- `query getLiveLineups({ quinielaId })` — resuelve el Torneo de la quiniela, trae sus
  `matches` en vivo y los lineups cacheados, devuelve una vista lista para render
  (`teamLite` para escudos vía `lib/view`). Vacío si no hay partidos en vivo. **Reactiva.**

### 5. Cron (`convex/crons.ts`)

```ts
crons.interval("sync live lineups", { minutes: 5 }, internal.lineups.syncLineups, {});
```

### 6. Web

- **`src/components/LiveLineups.tsx`**
  - `useQuery(api.lineups.getLiveLineups, { quinielaId })`.
  - Si no hay partidos en vivo → `return null` (no ocupa espacio).
  - Por cada partido: tarjeta `grain` con badge "EN VIVO", escudos (`TeamFlag`) y marcador.
  - Tap → `Dialog` (`ui/dialog.tsx`) con dos columnas: formación + DT arriba, 11 inicial y
    banca debajo. Si el 11 aún no está publicado, estado vacío ("Alineación por confirmar").
- **`src/routes/Mundial.tsx`**
  - Renderizar `<LiveLineups quinielaId={id} />` arriba, tanto en la rama `league` como en
    la de brackets, debajo del `header`.

### 7. Tipos (`convex/types.ts`)

Añadir `LiveLineupsData`, `LiveMatchView`, `TeamLineupView`, `PlayerView` para tipar la
query y los componentes.

## Testing (TDD)

- **`convex/lib/apiFootball.test.ts`**: `mapLineups` con payload de muestra (incluye caso
  array vacío); `matchLiveFixture` empareja con alias y devuelve `null` sin coincidencia;
  `normalizeTeamName` (acentos, sufijos).
- **`convex/lineups.test.ts`** (`convex-test`, `fetchFn` inyectado): 0 llamadas sin
  partidos vivos; upsert con vivos; no re-pide si `confirmed`; `getLiveLineups` solo trae
  partidos en vivo del torneo de la quiniela.
- **Componente** `LiveLineups.test.tsx`: no renderiza nada sin vivos; renderiza tarjetas y
  abre el `Dialog` con las alineaciones.
- (Opcional) Playwright para la sección "En vivo" con datos sembrados.

## Fuera de alcance (YAGNI)

- Cambios/tarjetas/eventos en vivo (requiere el endpoint de eventos → más llamadas).
- Alineaciones probables pre-partido.
- Fotos, stats o `grid` posicional dibujado de jugadores (guardamos `grid` pero no lo
  pintamos aún).
- Alineaciones de partidos no-vivos (agendados/terminados).

## Riesgos / notas

- **Emparejado por nombre:** principal fuente de fallos. Mitigación: normalización +
  `TEAM_ALIASES` + `apiFixtureId` persistido (se reconcilia una sola vez por partido). Si
  falla, simplemente no se muestra alineación (degradación suave, no rompe la vista).
- **Ventana de disponibilidad:** las alineaciones existen ~20-60 min antes del saque y
  durante el juego. Como gatillamos con `status="live"` (post-saque), siempre habrá dato;
  no cubrimos la ventana pre-partido (consistente con el alcance).
- **Cobertura de competiciones:** API-Football cubre los 12 torneos del catálogo y el
  Mundial 2026; el mismo code-path sirve para todas sin mapa de league-IDs (se empareja por
  `live=all`).
