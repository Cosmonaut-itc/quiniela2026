# Diseño — Tabla de jugadores expandible (equipos por jugador) y colapsable

**Fecha:** 2026-06-08
**Estado:** Aprobado, listo para plan de implementación.
**Idioma:** Español (UI, docs y commits).
**Ámbito:** Pestaña **General** (`src/routes/Join.tsx`), sección "Tabla de jugadores".

## 1. Contexto y problema

En la pestaña **General** (la vista pública por `joinToken`), la "Tabla de jugadores" lista a cada
participante con avatar, nombre, contador `aliveCount/totalCount` y un badge de estado
(`PlayerRow`). Hoy **no** se ven los equipos que le tocaron a cada quién, y la lista crece con el
número de inscritos, ocupando mucho espacio vertical en móvil.

Se quieren dos comportamientos nuevos:

1. **Carta expandible:** al tocar la carta de un jugador, se despliega y muestra **los equipos
   asignados a ese jugador**.
2. **Sección colapsable:** toda la sección "Tabla de jugadores" se puede colapsar/expandir para
   ahorrar espacio.

## 2. Alcance

**Incluye:**

- Extender `getOverview` para que cada jugador traiga sus equipos (`{ team, alive }[]`).
- `PlayerRow` se convierte en *disclosure*: al tocarla muestra/oculta sus equipos
  (**bandera + nombre + vivo/fuera**), con un chevron indicador.
- Cartas **independientes**: pueden estar varias expandidas a la vez.
- La sección "Tabla de jugadores" se vuelve **colapsable**, **expandida por defecto**.
- Verificación **end-to-end manual con Playwright MCP** (el proyecto no tiene suite E2E automatizada).

**No incluye (trabajo futuro / YAGNI):**

- Datos por equipo más allá de vivo/fuera (próximo partido, último resultado). Eso vive en "Mi panel"
  (`getPersonalPanel` / `TeamCard`) y encarecería la query para todos los jugadores; aquí se deja
  fuera a propósito.
- Persistencia del estado colapsado/expandido (localStorage). Empieza expandida en cada carga.
- Modo acordeón (abrir una carta cierra las demás). Se eligió comportamiento independiente.
- Mostrar pago / método de pago. Sigue siendo solo del admin; esta pantalla no lo toca.

## 3. Decisiones de arquitectura

### 3.1 Extender `getOverview` (vs. query lazy por jugador)

Los equipos por jugador se añaden al payload de `getOverview`. La query **ya carga en memoria**
`ownerships` (todas las de la quiniela), `states` (vivo/eliminado por equipo) y `teamById`, así que
construir la lista por jugador es **solo mapeo, sin lecturas extra de DB**. Llega todo en un fetch y
es reactivo.

**Alternativa descartada:** query *lazy* por jugador disparada al expandir. Reduciría el payload
inicial, pero añade una query nueva, estado de carga por carta y latencia al abrir; sobre-ingeniería
para el volumen real (decenas de jugadores × pocos equipos, solo banderas y nombres).

**Privacidad:** quién posee qué equipo **ya es público** en la pestaña **Mundial** (los grupos
muestran `ownerName`). Exponer los equipos por jugador en General **no abre un hueco nuevo**.

### 3.2 Componente colapsable sobre Base UI

Para la sección colapsable y para el panel de cada carta se usa un wrapper sobre el primitivo
`Collapsible` de **`@base-ui/react`** (mismo paquete ya usado por `dialog.tsx`, `dropdown-menu.tsx`,
`tabs.tsx`; **no se añade dependencia**). Aporta `aria-expanded`, manejo de teclado y animación de
altura por CSS vars de Base UI.

**Fallback:** si esta versión de `@base-ui/react` no exporta `Collapsible`, se cae al patrón
`useState` + truco `grid-rows-[0fr] → grid-rows-[1fr]` (transición de altura sin medición). Se
verifica al implementar el paso 5.1 (spike de import). En cualquier caso, la **API del wrapper**
(`src/components/ui/collapsible.tsx`) es la misma para el resto del código.

### 3.3 Estado de expansión local por carta

Cada `PlayerRow` mantiene su propio estado abierto/cerrado (`useState`), independiente de las demás
(decisión "varias abiertas a la vez"). La sección mantiene su propio estado, expandida por defecto.
Sin estado global ni en localStorage.

## 4. Modelo de datos

Sin cambios de schema. Se aprovecha lo existente: `ownerships` (pivote participante↔equipo),
`teams` (con `flag`, `name`, `group`, y estado vivo derivado en `states`).

## 5. Backend (Convex)

### 5.1 Query `getOverview` (`convex/quinielas.ts`)

Cada jugador gana `teams`:

```ts
teams: { team: TeamLite; alive: boolean }[]
```

- Dentro del `.map` existente ya se calcula `mine = ownerships.filter(o => o.participantId === p._id)`.
  Se reutiliza para construir, por cada `o` de `mine`:
  `{ team: teamLite(teamById.get(o.teamId))!, alive: states.get(o.teamId)!.alive }`.
- **Orden:** vivos primero, luego por grupo y nombre
  (`(b.alive?1:0) - (a.alive?1:0) || a.team.group.localeCompare(b.team.group) || a.team.name.localeCompare(b.team.name)`).
- `pending` (modo `on_reveal` con quiniela `open`): no hay ownerships → `teams: []`.
- `teamLite` ya existe y produce `TeamLite` (`{ code, name, flag, group }`).

`aliveCount`, `totalCount`, `status` y el resto de la query **no cambian**.

## 6. Tipos (`convex/types.ts`)

`OverviewData.players[]` += `teams: { team: TeamLite; alive: boolean }[]`.

## 7. Frontend

### 7.1 Componente nuevo `src/components/ui/collapsible.tsx`

Wrapper estilo del repo sobre `@base-ui/react/collapsible`, exportando lo necesario
(`Collapsible` (Root), `CollapsibleTrigger`, `CollapsiblePanel`). El panel anima altura con las
clases/`data-open`/`data-closed` ya usadas en el proyecto (`tw-animate-css`) + las CSS vars de Base
UI. (Fallback §3.2 si el primitivo no existe.)

### 7.2 `src/components/PlayerRow.tsx` — disclosure

- La fila actual (avatar, nombre, contador, badge) pasa a ser el **trigger** del collapsible de la
  carta, con un **chevron** (`transition-transform`, rota al abrir) como afordancia.
- **Panel** (debajo, dentro de la misma carta, separado por un borde superior sutil): lista de
  equipos en formato compacto — `🏴 {nombre}` + badge **Vivo/Fuera** (reusando los colores
  `alive`/`eliminated` de `TeamCard`/`StatusBadge`); equipos fuera con `opacity` + `line-through`.
- **No expandible** cuando `p.teams.length === 0` (incluye `pending`): sin chevron, sin
  `cursor-pointer`, sin trigger. La carta se ve como hoy.
- Estado local `useState(false)` por carta. Accesibilidad: `aria-expanded` (la da el wrapper) y la
  carta clickable es un `button`/trigger enfocable.
- El estilo campeón/eliminado/grain del contenedor se conserva.

Sub-render de cada equipo: una pequeña fila inline dentro de `PlayerRow` (o mini-componente
`PlayerTeamRow` en el mismo archivo) — **ligero**, sin `whenLabel`/próximo partido.

### 7.3 `src/routes/Join.tsx` — sección colapsable

- La sección "Tabla de jugadores" se envuelve en `Collapsible` (expandida por defecto).
- El `SectionHeading` "Tabla de jugadores" se vuelve el **trigger**, con chevron y un contador
  (p. ej. `· {data.players.length}`). El panel contiene la lista actual
  (`data.players.map(<PlayerRow/>)` + `EmptyTile` de lugares libres).
- El resto de la pantalla (header, notas, próximos duelos, link al Mundial, CTA) **sin cambios**.

## 8. Manejo de errores / estados vacíos

- Lista vacía: se conserva el `EmptyTile` "Aún no se inscribe nadie…".
- Jugador sin equipos (`pending` / `on_reveal` abierto): carta no expandible (§7.2).
- La query es la misma; no hay rutas de error nuevas.

## 9. Pruebas

**Backend (TDD — `convex/quinielas.test.ts`):**

- `getOverview` devuelve `teams` por jugador, con `alive` correcto (un equipo vivo y uno eliminado →
  `alive: true/false` respectivos) y **orden vivos-primero**.
- Jugador sin ownerships (`on_reveal` abierto / pending) → `teams: []`.

**Front (unit — `src/components/PlayerRow.test.tsx`, jsdom + Testing Library):**

- Equipos **ocultos** al render inicial; **click** en la carta → se ven (nombre/bandera de un equipo);
  **segundo click** → se ocultan.
- Carta con `teams: []` **no** expande (no aparece trigger/chevron; el click no revela panel).
- (Regresión) Sigue mostrando nombre y `aliveCount` como hoy.

**Sección colapsable (unit):** test del toggle vía el wrapper `collapsible` o un render ligero de la
lista (mostrar/ocultar el panel al accionar el trigger), evitando montar todo `Join` con la query de
Convex.

**Verificación manual E2E (Playwright MCP):** en una quiniela con jugadores y equipos repartidos:
expandir una carta muestra sus equipos; **varias cartas abiertas a la vez**; segundo toque las
colapsa; colapsar/expandir la **sección** completa oculta/muestra toda la lista.

## 10. Plan de despliegue

Orden del proyecto: **backend antes que frontend** (el front lee `players[].teams`, que el backend
debe exponer primero). Validación antes de desplegar: `npm test`, `npm run build`, `npm run lint` y la
verificación E2E manual. Deploy manual front+back juntos.
