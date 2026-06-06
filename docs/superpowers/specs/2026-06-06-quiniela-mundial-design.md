# Diseño — Quiniela Mundial 2026

**Fecha:** 2026-06-06
**Estado:** Aprobado (pendiente revisión final del usuario antes del plan de implementación)
**Autor:** brainstorming colaborativo

---

## 1. Resumen

App web para organizar una **quiniela del Mundial 2026** entre familia y amigos, **sin cuentas**. Una persona crea una quiniela, comparte un link, y quienes entran reciben **equipos al azar**. Cuando dos de sus equipos se enfrentan en un partido real del Mundial, sus dueños "juegan" entre sí. Un equipo queda eliminado cuando sale del torneo; un participante queda descalificado cuando **todos** sus equipos están fuera. **El dueño del equipo campeón se lleva el premio completo** (winner-take-all).

Mobile-first, responsive, en español. Stack: **React + Vite**, **shadcn/ui**, **Tailwind 4**, **Convex** (backend). Frontend desplegado en **Railway**; backend en **Convex Cloud**.

### Mecánica central (confirmada)
El **bracket real del Mundial** genera los enfrentamientos entre participantes. "Contra quién juego ahora" = el dueño del equipo que enfrenta a alguno de mis equipos en el partido en curso/próximo.

---

## 2. Objetivos y no-objetivos

### Objetivos (v1)
- Crear quiniela: nombre, foto opcional, premio (texto libre), número de participantes (N).
- Tres enlaces sin cuentas: **admin**, **invitar/ver**, **personal**.
- Unirse con nombre + foto → **reparto aleatorio instantáneo** de equipos.
- **Redistribución** de equipos de lugares vacíos al cerrar inscripciones → los 48 equipos siempre tienen dueño.
- Panel personal: mis equipos y resultados, contra quién juego ahora/después, dueño del rival, mi estado.
- Vista general: tabla de jugadores, lugares libres, próximos duelos entre participantes, eliminados.
- Pestaña "Mundial": grupos + bracket con el dueño marcado en cada equipo.
- **Sincronización automática** de resultados desde una API de fútbol + **corrección manual** del admin.
- Eliminación y campeón calculados **automáticamente**.

### No-objetivos (fuera de v1)
- Cuentas / login / **pagos** (el premio se arregla fuera de la app).
- Multi-torneo (se fija WC2026; el modelo deja la puerta abierta).
- Notificaciones push / correos *(v1.5)*.
- Cambiar N después de crear *(v1.5)*.
- Bracket con animaciones elaboradas, chat, reacciones, historial de movimientos.
- Tiempo real al segundo (el sondeo cada pocos minutos es suficiente).

---

## 3. Arquitectura

### 3.1 Idea clave: dos capas
El Mundial real es **único y compartido** por todas las quinielas. Se separa en:

- **Capa global (compartida):** equipos, partidos, quién sigue vivo, quién es campeón. Se sincroniza **una vez** desde la API y sirve a todas las quinielas a la vez.
- **Capa de quiniela (por pool):** solo la "dueñería" (qué equipos le tocan a cada quien). Capa delgada sobre lo global.

Beneficio: una sola sincronización actualiza el estado de **todas** las quinielas; cruzar "equipo → dueño" y "rival real → persona" es trivial.

### 3.2 Estrategia de datos en capas
1. **Semilla estática** (al desplegar): 48 equipos, 12 grupos y calendario de fase de grupos, precargados desde datos abiertos (openfootball/worldcup.json). Garantiza funcionamiento aunque la API falle.
2. **Sincronización automática** (durante el torneo): *scheduled action* de Convex consulta la API cada pocos minutos (más seguido en ventanas de partido) y actualiza `matches` y `teams.alive`.
3. **Corrección manual** (red de seguridad): el admin sobrescribe un marcador; se marca con `manualOverride` para que la siguiente sincronización no lo pise.

### 3.3 Autoridad de eliminación/avance
La **API es la autoridad** de "quién sigue vivo / quién quedó fuera / quién es campeón". La app **no reimplementa las reglas de desempate de FIFA**. Se mapea equipo → dueño y se muestra.

- **Fuente primaria:** standings de la API (fase de grupos) + fixtures de eliminatoria.
- **Respaldo robusto** (si la API no expone un flag de "clasificado"): un equipo que no aparece en ningún partido de eliminatoria tras cerrarse la fase de grupos se considera **eliminado**. Esto evita por completo la lógica de "8 mejores terceros" y desempates.

### 3.4 Flujo en una frase
`Scheduled action (poll API) → tabla matches en Convex → queries reactivas derivan standings/eliminación/campeón y los cruzan con dueños → 3 vistas (personal, general, admin) que se actualizan solas en todos los dispositivos.`

---

## 4. Modelo de datos (Convex)

### Tablas globales (sembradas + sincronizadas)

**`teams`**
| Campo | Tipo | Notas |
|---|---|---|
| code | string | ISO/abreviatura (ej. "BRA") |
| name | string | "Brasil" |
| flag | string | emoji bandera |
| group | string | "A".."L" |
| alive | boolean | lo mantiene la sincronización |
| currentStage | string | "group" \| "r32" \| ... \| "champion" \| "out" |
| eliminatedAt | number? | timestamp |
| externalId | string | id en la API |

**`matches`**
| Campo | Tipo | Notas |
|---|---|---|
| stage | string | "group"\|"r32"\|"r16"\|"qf"\|"sf"\|"third"\|"final" |
| group | string? | solo fase de grupos |
| homeTeamId / awayTeamId | Id<"teams">? | `null` = "Por definir" |
| kickoffAt | number | timestamp |
| homeScore / awayScore | number? | |
| status | string | "scheduled"\|"live"\|"finished" |
| winnerTeamId | Id<"teams">? | lo fija la sincronización (incluye ET/penales según la API) |
| externalId | string | id en la API (clave de upsert) |
| manualOverride | boolean | si `true`, la sincronización no lo pisa |
| bracketSlot | string? | identificador de posición en el árbol de eliminatoria |

### Tablas por quiniela

**`quinielas`**
| Campo | Tipo | Notas |
|---|---|---|
| name | string | |
| photoId | Id<"_storage">? | foto opcional |
| prizeText | string | texto libre, ej. "$5,000" |
| numParticipants | number | N (2..48) |
| slotSizes | number[] | tamaños de lote precalculados (suman 48), barajados |
| adminToken | string | secreto |
| joinToken | string | secreto compartible |
| status | string | "open"\|"locked"\|"finished" |
| championParticipantId | Id<"participants">? | se fija al terminar la final |
| lockedAt | number? | |
| createdAt | number | |

**`participants`**
| Campo | Tipo | Notas |
|---|---|---|
| quinielaId | Id<"quinielas"> | |
| name | string | |
| photoId | Id<"_storage">? | |
| personalToken | string | secreto |
| slotIndex | number | orden de llegada |
| joinedAt | number | |

**`ownerships`** — un dueño por equipo por quiniela
| Campo | Tipo | Notas |
|---|---|---|
| quinielaId | Id<"quinielas"> | |
| teamId | Id<"teams"> | |
| participantId | Id<"participants"> | |

Índices clave: `ownerships` por `(quinielaId, teamId)` y por `(quinielaId, participantId)`; `matches` por `externalId` y por `(stage, kickoffAt)`; `quinielas` por `adminToken`/`joinToken`; `participants` por `personalToken` y por `quinielaId`.

**Estado derivado (queries reactivas, no se duplica en BD):** equipos de un participante, vivos/eliminados de una persona, "contra quién juego", standings, próximos duelos entre participantes.

---

## 5. Enlaces (sin cuentas)

| Enlace | Ruta | Quién |
|---|---|---|
| Admin | `/q/:id/admin/:adminToken` | solo el creador |
| Invitar / Ver | `/q/:id/join/:joinToken` | se comparte; muestra la quiniela y permite unirse |
| Personal | `/q/:id/me/:personalToken` | panel privado de cada jugador |

- Tokens = strings aleatorios largos generados al crear la quiniela / al unirse.
- El navegador guarda el `personalToken` en **localStorage** para regreso automático.
- Si alguien pierde su link personal, el admin puede reenviárselo desde su panel.
- El **secreto de la API de fútbol** vive solo como variable de entorno en Convex; el navegador nunca habla con la API directamente.

---

## 6. Flujos

### 6.1 Crear
Home → formulario (nombre, foto?, premio, N) → genera quiniela + `adminToken` + `joinToken` + `slotSizes` → admin cae en su panel con el link para compartir. El creador **no** ocupa un lugar automáticamente; si quiere jugar, se une como uno más usando el link de invitar (§6.2).

### 6.2 Unirse + reparto (instantáneo)
Abre link de invitar → ve la quiniela y lugares libres → "Unirme" → nombre + foto opcional → **mutación transaccional**:
1. Valida que haya lugar y que la quiniela esté `open`.
2. Crea `participant` con `personalToken` y `slotIndex = k`.
3. Toma `slotSizes[k]` equipos **al azar** del pool de equipos aún sin dueño en esta quiniela; crea sus `ownerships`.
4. Redirige a su panel personal (guarda token en localStorage).

La transaccionalidad de Convex evita choques (dos personas, mismo lugar/equipo) → el segundo recibe "ese lugar ya se tomó".

### 6.3 Cerrar + redistribuir
Disparadores: el admin presiona "Cerrar inscripciones" **o** auto-cierre al `kickoffAt` del primer partido del Mundial.
Al cerrar:
1. Toma los equipos aún sin dueño (de lugares no llenados).
2. Los reparte **uno a uno al participante con menos equipos** (al azar entre empates) hasta agotarlos → conteos lo más parejos posible.
3. `status = "locked"`, `lockedAt = now`. No más inscripciones.

Edge: si solo hay 1 participante, se avisa al admin (válido pero trivial). Mínimo recomendado 2.

### 6.4 Sincronizar (automático)
*Scheduled function* de Convex (cron) cada pocos minutos:
1. Consulta la API por actualizaciones de partidos.
2. Hace **upsert de `matches`** por `externalId`, **respetando `manualOverride`**.
3. Actualiza `teams.alive` / `currentStage` / `winnerTeamId` según standings + fixtures de eliminatoria de la API (con el respaldo de §3.3).
4. Si la final termina → fija el equipo campeón.

Como las queries son reactivas, todos los dispositivos abiertos se actualizan solos.

### 6.5 Eliminación y campeón
- **Eliminación:** cuando `teams.alive` de **todos** los equipos de un participante es `false` → "descalificado" (panel personal + tachado en la general).
- **Campeón:** equipo con la final ganada → su dueño → `championParticipantId`, `status = "finished"` → "🏆 ¡Ganaste!".

---

## 7. Vistas / pantallas (mobile-first)

Navegación de 3 pestañas dentro del contexto de la quiniela: **Mi panel · General · Mundial**.

### A. Panel personal (`/me/:token`) — pantalla principal
- Encabezado: avatar + nombre (editables) + estado (Vivo · N equipos / Fuera / 🏆 Campeón).
- Recordatorio del premio.
- **"Hoy juegas contra"**: por cada equipo vivo con partido en curso/próximo → rival + dueño del rival.
- **"Mis equipos"**: cards con bandera, nombre, grupo, estado, **próximo rival + fecha + dueño del rival**, y último resultado.

### B. Vista general (`/join/:token`)
- Encabezado: foto + nombre de la quiniela + premio + "X de N lugares".
- **Tabla de jugadores** ordenada por (vivos primero, luego más equipos vivos): avatar, nombre, equipos vivos/total, badge.
- **Lugares libres** ("esperando jugador") + botón **Unirme** (si `open` y hay lugar y no estás dentro).
- **"Próximos duelos entre ustedes"**: partidos reales donde ambos equipos tienen dueño en la quiniela.

### C. Pestaña Mundial
- Sub-toggle **Grupos / Bracket**.
- **Grupos:** mini-tabla por grupo (puntos), con el **avatar del dueño** en cada equipo; indicador clasifica/eliminado.
- **Bracket:** árbol Octavos→Cuartos→Semis→Final con scroll horizontal; cada llave muestra equipos + dueño + marcador; slots no definidos = "Por definir".
- Tocar un equipo en cualquier vista → de quién es + todos sus partidos.

### D. Panel admin (`/admin/:token`)
- Compartir link de invitación (copiar + QR).
- Ajustes: nombre, foto, premio.
- Lista de participantes (reenviar link personal de cada quien).
- Botón **Cerrar inscripciones** (dispara la redistribución).
- **Corregir marcador** a mano (fija `manualOverride`).
- Estado de la sincronización (última corrida, errores).

---

## 8. Despliegue

- **Frontend (Railway):** build estático de Vite servido en Railway; variable `VITE_CONVEX_URL`. URL pública (dominio propio opcional).
- **Backend (Convex Cloud):** BD, funciones, *scheduled action* de sincronización, almacenamiento de fotos. Deploy con `npx convex deploy`.
- **Secreto de la API:** variable de entorno en Convex (lado servidor).
- **Semilla:** script/mutation de inicialización que carga equipos, grupos y fixtures de grupos desde el dataset estático.

---

## 9. Manejo de errores

| Escenario | Comportamiento |
|---|---|
| API caída / sin cuota | La sincronización registra el error, conserva el último estado, reintenta con backoff. La app no se rompe. |
| Corrección manual vs sincronización | `manualOverride` gana hasta que el admin lo libere. |
| Choque al unirse | Mutación transaccional; el segundo recibe "lugar ya tomado". |
| Equipos de eliminatoria sin definir | Se muestran como "Por definir". |
| Link personal perdido | El admin lo reenvía. |
| Sin foto | Avatar con inicial. |
| 1 solo participante | Aviso al admin; permitido pero trivial. |

---

## 10. Pruebas

- **Algoritmo de reparto** (unit): `slotSizes` suma 48 y es lo más parejo posible; ningún equipo con dos dueños; tras redistribuir, los 48 tienen dueño y los conteos quedan parejos.
- **Estado derivado** (unit): eliminación cuando todos los equipos están fuera; identificación de campeón; "contra quién juego" elige el partido correcto.
- **Sincronización** (integración, con respuestas de API simuladas): upsert por `externalId`, respeto a `manualOverride`, transición de `teams.alive`.
- **Simulación de torneo completo**: desde la semilla, avanzar resultados hasta la final y verificar cascada de eliminación + dueño campeón.
- **Frontend**: pruebas de componentes de las 3 vistas; pruebas manuales en celular.
- Se usará **TDD** (skill test-driven-development) durante la implementación.

---

## 11. Riesgos y validaciones tempranas

1. **Cobertura real de la API para WC2026** (riesgo #1): confirmar en el **primer paso** de implementación que la API elegida ya expone la competencia 2026 con fixtures y el código/endpoints correctos. Candidatas: football-data.org (gratis, WC incluido), API-Football (`league=1`, `season=2026`, 15s, free ~100/día). Respaldo de datos: openfootball/worldcup.json.
2. **Desempates FIFA / mejores terceros**: mitigado al usar la API como autoridad + el respaldo de §3.3 (eliminado = ausente del bracket tras cerrar grupos).
3. **Cuota de la API en vivo**: sondeo adaptativo (denso solo en ventanas de partido) para no exceder el plan gratis.
4. **Disponibilidad de la semilla 2026** (sorteo de grupos ya realizado): verificar que el dataset estático tenga grupos y calendario definitivos.

---

## 12. Decisiones tomadas (registro)

- Resultados: **automáticos vía API** + override manual.
- Identidad: **link personal secreto** por participante (+ localStorage).
- Reparto: **redistribuir al cerrar** (los 48 siempre con dueño).
- Premio: **todo al campeón** (winner-take-all).
- Autoridad de eliminación/avance: **la API**, sin reimplementar reglas FIFA.
- Backend: **Convex Cloud**; frontend en **Railway**.
- Cierre: admin manual **o** auto-cierre al primer partido.
- Participantes: 2..48; el creador puede jugar.
