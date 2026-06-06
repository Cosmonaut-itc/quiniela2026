# Decisión de API — datos del Mundial 2026

## API elegida: **football-data.org**

- **Base URL:** `https://api.football-data.org/v4`
- **Auth:** header `X-Auth-Token: <token>`.
  - El token vive **solo** como variable de entorno de Convex `FOOTBALL_DATA_TOKEN`.
  - **Nunca** se commitea (ver `.gitignore`: `.env`, `.env.local`). No aparece en este repo.
- **Competición:** code `WC` (FIFA World Cup, `competition.id = 2000`).
- **Temporada actual:** `2026-06-11` → `2026-07-19` (`season.id = 2398`).
- **Rate limit (free tier):** **10 peticiones por minuto**. Por eso las respuestas en
  vivo se capturan una sola vez a disco y el snapshot se genera offline; los tests y el
  seed leen del snapshot, no de la API.

## Endpoints usados

| Endpoint | Uso |
| --- | --- |
| `GET /competitions/WC` | Metadatos de la competición y temporada actual (fechas, `currentMatchday`). |
| `GET /competitions/WC/teams` | Las 48 selecciones (`.teams[]`): `id`, `tla`, `name`, `area.code`. |
| `GET /competitions/WC/matches` | Los 104 partidos (`.matches[]`): `stage`, `group`, `homeTeam`/`awayTeam`, `utcDate`, `status`, `score`. |

## Estado del snapshot (pre-torneo)

El snapshot `convex/data/wc2026-snapshot.json` es el **estado pre-torneo**:

- Los 104 partidos están `scheduled` (en la API llegan como `TIMED`), sin marcadores
  (`homeScore`/`awayScore` = `null`).
- Los **32 partidos de eliminatorias** tienen los equipos **TBD**: en la API
  `homeTeam.id` y `awayTeam.id` son `null` porque el bracket aún no se llena. Se mapean a
  `homeExternalId: null` / `awayExternalId: null`. Se rellenarán cuando avance el torneo.
- Los 72 partidos de fase de grupos sí traen ambos equipos.

## Mapeo de campos (forma interna del proyecto)

### Equipos (`teams[]`)

| Campo interno | Origen | Regla |
| --- | --- | --- |
| `externalId` | `team.id` | `String(team.id)` |
| `code` | `team.tla` | tal cual (p. ej. `BRA`, `URY`, `ENG`) |
| `name` | `team.name` | tal cual |
| `flag` | `team.area.code` | emoji desde un **mapa fijo `area.code → emoji`** (ver abajo) |
| `group` | partidos de grupo | derivado, una sola letra `A`..`L` |

### Partidos (`matches[]`) — se conserva el orden de la API

| Campo interno | Origen | Regla |
| --- | --- | --- |
| `externalId` | `match.id` | `String(match.id)` |
| `stage` | `match.stage` | tabla de stages (abajo) |
| `group` | `match.group` | grupo: prefijo `GROUP_` eliminado; eliminatorias: `null` |
| `homeExternalId` | `match.homeTeam.id` | `id != null ? String(id) : null` |
| `awayExternalId` | `match.awayTeam.id` | `id != null ? String(id) : null` |
| `kickoffAt` | `match.utcDate` | `Date.parse(utcDate)` (ms, entero) |
| `homeScore` | `match.score.fullTime.home` | `?? null` |
| `awayScore` | `match.score.fullTime.away` | `?? null` |
| `status` | `match.status` | tabla de status (abajo) |
| `bracketSlot` | derivado | grupo: `null`; eliminatorias: etiqueta estable `stage-N` |

### Tabla de stages (`match.stage` → `stage`)

| API | Interno |
| --- | --- |
| `GROUP_STAGE` | `group` |
| `LAST_32` | `r32` |
| `LAST_16` | `r16` |
| `QUARTER_FINALS` | `qf` |
| `SEMI_FINALS` | `sf` |
| `THIRD_PLACE` | `third` |
| `FINAL` | `final` |

Cualquier stage no mapeado → **falla ruidosamente** (throw).

### Tabla de status (`match.status` → `status`)

| API | Interno |
| --- | --- |
| `SCHEDULED`, `TIMED` | `scheduled` |
| `IN_PLAY`, `PAUSED` | `live` |
| `FINISHED` | `finished` |
| `SUSPENDED`, `POSTPONED` | `scheduled` |

Cualquier status no mapeado → **falla ruidosamente** (throw).

### Strip del prefijo de grupo

`match.group` viene como `GROUP_A`..`GROUP_L`; se elimina el prefijo `GROUP_` para quedar
en `A`..`L`. Para partidos de eliminatorias, `group = null`.

### Bandera desde `area.code`

La bandera **no se calcula** (nada de convertir alpha3 → alpha2). Se usa un **mapa fijo
`area.code → emoji`** porque los `area.code` de football-data son una mezcla de ISO y
códigos propios. Casos especiales: `ENG` → 🏴󠁧󠁢󠁥󠁮󠁧󠁿 y `SCO` → 🏴󠁧󠁢󠁳󠁣󠁴󠁿 (secuencias de
*subdivision flag tags*, no banderas regionales). Si un equipo trae un `area.code` que no
está en el mapa, el build **falla ruidosamente** en lugar de emitir bandera vacía.

### Derivación del grupo de cada equipo

El grupo de cada selección se deriva de sus partidos de fase de grupos: se recorren los
partidos con `stage === "GROUP_STAGE"`, y para cada uno, **ambos** `homeTeam.id` y
`awayTeam.id` pertenecen a `match.group` (`GROUP_C` → `C`). Cada equipo debe resolver a
**exactamente un** grupo; cero grupos o grupos en conflicto → **falla ruidosamente**.

### Esquema de `bracketSlot`

Para eliminatorias, etiqueta estable 1-based por stage, en el orden de la API:

- `r32-1`..`r32-16`
- `r16-1`..`r16-8`
- `qf-1`..`qf-4`
- `sf-1`..`sf-2`
- `third-1`
- `final-1`

Los partidos de fase de grupos tienen `bracketSlot = null`.

## Validaciones del build (todas lanzan en caso de fallo)

- Exactamente 48 equipos y 104 partidos.
- Cada equipo con `flag` no vacía, `code` no vacío y `group` en `A`..`L`.
- Exactamente 12 grupos distintos, cada uno con 4 equipos.
- Conteo por stage: `group` 72, `r32` 16, `r16` 8, `qf` 4, `sf` 2, `third` 1, `final` 1.
- Todo partido de grupo con `homeExternalId` y `awayExternalId` no nulos y `group` no nulo.
- Todo partido de eliminatoria con `group === null` y `bracketSlot` no nulo.
- Todo `homeExternalId`/`awayExternalId` no nulo existe en los `externalId` de equipos.
- Todo `kickoffAt` es un entero positivo.
