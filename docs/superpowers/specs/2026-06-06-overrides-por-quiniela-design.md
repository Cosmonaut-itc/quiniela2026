# Diseño — Overrides de marcador por quiniela (v1.5)

**Fecha:** 2026-06-06
**Estado:** Aprobado, listo para plan de implementación.
**Idioma:** Español (UI, docs y commits).
**Spec base:** `docs/superpowers/specs/2026-06-06-quiniela-mundial-design.md` (este documento revisa §3 y §12 de aquél).

## 1. Contexto y problema

En v1.0 la corrección manual del admin (`setMatchResultManual`) escribe en la fila **global** del
partido (`matches`) con `manualOverride: true` y dispara `recomputeTeamStates`, que actualiza el
estado global `teams.alive/currentStage` y finaliza el campeón de **todas** las quinielas cerradas.

Consecuencia (limitación conocida, documentada en el handoff v1.0): en un despliegue con varias
quinielas, una corrección hecha por el admin de una quiniela **afecta a todas**. Aceptable para una
sola familia; inaceptable multi-quiniela.

**Objetivo:** que una corrección de marcador quede **contenida a la quiniela donde se hace**. El
`matches` global vuelve a ser verdad única de la API; cada quiniela ve los resultados de la API con
sus propias correcciones encima.

## 2. Alcance

**Incluye:**
- Overrides de marcador por quiniela (tabla nueva + derivación por quiniela en lectura).
- Revertir un override al resultado automático (API), solo para esa quiniela.
- Selector de ganador para empates de eliminatoria (penales/prórroga) en la corrección manual
  (el backend ya soporta `winnerExternalId`; faltaba exponerlo en la UI).
- Tests de regresión que garanticen el aislamiento entre quinielas + validación Playwright.

**No incluye (trabajo futuro, §11):** soltar columnas obsoletas vía migración, borrado/archivado de
quinielas, auditoría de overrides, notificaciones, vista pública global.

## 3. Decisión de arquitectura

**Enfoque elegido: tabla `matchOverrides` por quiniela + derivación en lectura.**

El `matches` global queda como verdad única de la API. La corrección manual escribe solo en
`matchOverrides` de esa quiniela. Las queries derivan vivos/campeón/standings por quiniela con las
funciones puras existentes (`computeTeamStates`, `computeGroupStandings`), alimentándolas con los
**partidos efectivos** de esa quiniela = partidos globales con sus overrides encima.

Alternativas descartadas:
- **Estados de equipo materializados por quiniela** (`quinielaTeamStates` recomputada en cada sync):
  O(quinielas × equipos) escrituras por cada corrida del cron; más piezas; más riesgo de quedar
  *stale*. Peor a esta escala.
- **Override solo de display** (guardar el marcador pero no re-derivar): no aísla de verdad — vivos
  y campeón seguirían siendo globales.

## 4. Modelo de datos

### Tabla nueva (aditiva)

```ts
matchOverrides: defineTable({
  quinielaId: v.id("quinielas"),
  matchId: v.id("matches"),
  homeScore: v.number(),
  awayScore: v.number(),
  status: v.string(),                  // "finished" | "live"
  winnerTeamId: v.optional(v.id("teams")),
})
  .index("by_quiniela", ["quinielaId"])
  .index("by_quiniela_match", ["quinielaId", "matchId"])
```

- La **presencia** de una fila = ese partido está corregido a mano en esa quiniela.
- `by_quiniela_match` para upsert/lookup/borrado puntual; `by_quiniela` para cargar todos en lectura.
- `matchId` (no `externalId`) como referencia interna; la mutación traduce el `externalId` de la UI.

### Campos que quedan obsoletos (relajar a `optional`, dejar de usar)

| Campo | Antes | Ahora |
|-------|-------|-------|
| `matches.manualOverride` | `v.boolean()`, bloqueaba el sync y marcaba el badge | `v.optional(v.boolean())`, **sin uso**. El partido global siempre sigue la API. |
| `quinielas.championParticipantId` | se fijaba al terminar la final (global) | `v.optional(...)` (ya lo era), **sin escritura**. El campeón se deriva por quiniela en lectura. |

Cambio **no-destructivo**, un solo deploy: relajar `required → optional` valida con los documentos
existentes (sus valores actuales siguen siendo válidos) y los nuevos pueden omitirlos. Soltar las
columnas del todo se difiere a trabajo futuro (§11).

## 5. Capa de derivación compartida — `convex/lib/resolve.ts` (pura, testeable)

```ts
export type OverrideRow = {
  matchId: string; homeScore: number; awayScore: number;
  status: string; winnerTeamId: string | null;
};

/** Partidos globales con los overrides de UNA quiniela encima (el override gana solo en
 *  score/status/winner; homeTeamId/awayTeamId/stage/kickoff/group no cambian). */
export function effectiveMatches(matches: MatchRow[], overrides: OverrideRow[]): MatchRow[];

/** Equipo cuyo estado es "champion" (o null). */
export function championTeamId(states: Map<string, TeamState>): string | null;
```

`MatchRow` y `TeamState` se reutilizan de `convex/lib/tournament.ts`.

Patrón en cada query por quiniela:
1. cargar `teams` + `matches` globales + `matchOverrides` de la quiniela (`by_quiniela`);
2. `eff = effectiveMatches(matchRows, overrideRows)`;
3. `states = computeTeamStates(teamRows, eff)` → vivos/etapa **por quiniela**;
4. campeón = `championTeamId(states)` → dueño en esa quiniela → `championParticipantId` efectivo;
5. standings y marcadores se leen de `eff` (no del global).

## 6. Write path — `convex/matches.ts`

### `setMatchResultManual` (reescrito; misma firma pública)

```ts
setMatchResultManual({
  adminToken, matchExternalId,
  homeScore, awayScore, finished,
  winnerExternalId?,            // null | string | undefined
}) -> { ok: true }
```
- Resuelve la quiniela por `adminToken` y el partido por `matchExternalId`.
- Calcula `winnerTeamId` (de `winnerExternalId` si viene; si no, del marcador: home>away→home,
  away>home→away, empate→none) **usando los equipos del partido global**.
- **Upsert** en `matchOverrides` por `(quinielaId, matchId)`:
  `{ homeScore, awayScore, status: finished ? "finished" : "live", winnerTeamId }`.
- **No** escribe en `matches`. **No** llama a `recomputeTeamStates`.

### `clearMatchOverride` (nueva)

```ts
clearMatchOverride({ adminToken, matchExternalId }) -> { ok: true }
```
- Resuelve quiniela + partido; borra la fila de `matchOverrides` de `(quinielaId, matchId)` si existe
  (idempotente si no existe). Revertir = volver a seguir la API/cron en esa quiniela.

### `recomputeTeamStates` (internal, ajustado)

- **Se elimina el bloque de finalización de campeón** (era lo único que cruzaba quinielas).
- Sigue actualizando `teams.alive/currentStage/eliminatedAt` global = *baseline* de la API (lo que
  ve una quiniela **sin** overrides). Se documenta que las vistas por quiniela **siempre derivan**;
  este baseline no lo leen las queries por quiniela (queda como verdad-API coherente para depuración
  y posibles vistas globales futuras).

### `upsertMatchResult` (cron, ajustado)

- Se elimina el bloque `if (existing?.manualOverride) return;` y deja de escribir `manualOverride`.
  El partido global siempre refleja la API.

## 7. Read paths — las 4 queries derivan por quiniela

| Query | Cambio |
|-------|--------|
| `getMundial` | standings via `computeGroupStandings` sobre `eff`; `alive` desde `states`; marcadores del bracket desde `eff`. |
| `getPersonalPanel` | `nextMatchFor`/`lastResultFor` sobre `eff`; `alive` desde `states`; `status` campeón desde campeón derivado. |
| `getOverview` | `aliveCount` por jugador desde `states`; campeón derivado; duelos próximos filtran por `status` efectivo. |
| `getAdmin` | marcadores/status desde `eff`; `manualOverride` = "esta quiniela tiene override de ese partido"; añade `homeExternalId`/`awayExternalId` y `winnerExternalId` efectivo para el selector de ganador. |

El `status` "finished" de la quiniela y el campeón pasan a **derivarse en lectura**
(`effectiveChampion ? "finished" : qn.status`). Nada del ciclo de vida almacenado depende del
"finished" persistido (join/close/autoClose solo consultan "open"/"locked").

### Cambios de tipos (`convex/types.ts`)

`AdminData.matches[]` añade: `homeExternalId: string | null`, `awayExternalId: string | null`,
`winnerExternalId: string | null`. El resto de formas no cambia.

## 8. UI admin — `src/routes/Admin.tsx`

- El badge "editado a mano" pasa a significar *override en esta quiniela* (sin cambio visual, sí de
  semántica por el nuevo `manualOverride` derivado).
- **Botón "↺ volver al automático"** visible solo cuando el partido tiene override en la quiniela;
  llama a `clearMatchOverride`.
- **Selector de ganador** (radio/segmented: local / empate-sin-ganador / visitante) para partidos de
  eliminatoria (`stage !== "group"`); al guardar empate con ganador elegido envía `winnerExternalId`.
  Para grupos no se muestra (el empate es válido). Preselecciona con el `winnerExternalId` efectivo.

## 9. Migración / deploy

- Aditivo (`matchOverrides`) + relajar 2 campos a `optional` → **un solo `npx convex deploy`** (dev,
  luego prod). **Sin migración de datos** (el torneo no ha arrancado: marcadores aún `null`, ningún
  `manualOverride` real, ninguna quiniela "finished").
- `convex/_generated/` se commitea (repo auto-consistente).

## 10. Plan de pruebas

TDD estricto (rojo → verde → refactor). Vitest + convex-test (patrón edge-runtime ya usado).

**Unitarias puras** (`convex/lib/resolve.test.ts`):
- `effectiveMatches` fusiona el override sobre el global (score/status/winner) y deja intactos los
  partidos sin override y los equipos del partido.
- `championTeamId` devuelve el ganador de la final / null.

**Integración convex-test** (`convex/overrides.test.ts` nuevo):
1. **Aislamiento (test clave):** seed; 2 quinielas A y B con un participante cada una dueño de cierto
   equipo; A corrige un partido (elimina equipo X / cambia marcador); `getMundial`/`getPersonalPanel`
   de A reflejan el cambio, los de **B no** (X sigue vivo, marcador de la API).
2. **Campeón por quiniela:** A corrige la final → campeón y `status:"finished"` solo en A; B no.
3. **Revert:** override → `clearMatchOverride` → A vuelve al resultado de la API.
4. **Selector KO:** empate + `winnerExternalId` en A elimina al perdedor solo en A.
5. **Independencia del cron:** tras override en A, `upsertMatchResult` actualiza el partido global y B
   ve el nuevo resultado; A conserva su override.

**Frontend/E2E (Playwright MCP):** 2 quinielas en el navegador; override en una; verificar que la otra
no cambia; revert; selector de ganador. 0 errores de consola.

**Regresión protegida:** el test #1 es exactamente la condición que reintroduciría el bug; debe
fallar si alguien vuelve a acoplar la corrección al estado global.

## 11. Trabajo futuro

| # | Trabajo | Esfuerzo | Valor | Recomendación |
|---|---------|----------|-------|---------------|
| 1 | Borrado/archivado de quinielas (resuelve la quiniela vacía de prod) | Bajo | Medio | Justo después |
| 2 | Auditoría/historial de overrides (quién cambió qué, cuándo) | Bajo | Medio | Justo después |
| 3 | Soltar columnas obsoletas (`manualOverride`, `championParticipantId`) vía migración | Bajo | Limpieza | Cuando esto lleve días estable en prod |
| 4 | Notificaciones push/email (tu equipo juega / eliminado / ganaste) | Alto | Alto | Mayor valor a usuarios, después |
| 5 | Vista pública global del Mundial (sin quiniela) | Medio | Medio | Oportunista (el baseline global ya queda limpio) |
| 6 | Editar N tras crear · dominio propio en Railway (v1.5 del spec base) | Medio | Bajo-Medio | Backlog |
| 7 | E2E (Playwright) en CI + monitoreo del cron durante el torneo | Medio | Alto (operación) | Antes del 11-jun-2026 |

## 12. Decisiones

| Tema | Decisión |
|------|----------|
| Aislamiento de correcciones | Overrides por quiniela en tabla propia; verdad-API global intacta. |
| Derivación de vivos/campeón | En lectura, por quiniela, con las funciones puras existentes. |
| Override vs sync | El override gana **en esa quiniela**; el global siempre sigue la API. |
| Revertir | `clearMatchOverride` borra el override → vuelve al automático en esa quiniela. |
| Empate en eliminatoria | Selector de ganador en la UI; backend ya resolvía con `winnerExternalId`. |
| `status:"finished"` y campeón | Derivados en lectura por quiniela (no persistidos). |
| Campos obsoletos | Relajados a `optional` y sin uso; columnas se sueltan en trabajo futuro. |
| Migración | Aditiva + relajar a optional; un deploy, sin migración de datos. |

## 13. Self-review

- Sin placeholders ni TODOs; firmas de funciones bloqueadas (§6).
- Consistente con el modelo de datos del spec base; revisa explícitamente §3/§12 de aquél.
- Alcance acotado a un solo plan de implementación.
- Ambigüedad resuelta: el global es verdad-API; las vistas por quiniela siempre derivan; "finished"
  y campeón se derivan, no se persisten.
