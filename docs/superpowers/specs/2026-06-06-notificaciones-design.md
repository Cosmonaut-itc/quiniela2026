# Diseño — Notificaciones sin correo ni celular (in-app + Web Push opcional)

**Fecha:** 2026-06-06
**Estado:** Aprobado, listo para plan de implementación.
**Idioma:** Español (UI, docs y commits).
**Spec base:** `docs/superpowers/specs/2026-06-06-overrides-por-quiniela-design.md` (deriva por quiniela con `resolveQuiniela`) y `2026-06-06-notas-y-tracking-pagos-design.md` (estado actual del schema).

## 1. Contexto y problema

La app es **deliberadamente "sin cuentas"**: a cada quien se le identifica por *tokens* en links
(`adminToken`, `joinToken`, `personalToken`), y el `personalToken` se guarda en `localStorage`. Hoy
no hay forma de avisar a un jugador de lo que pasa en su quiniela (su equipo juega, lo eliminaron,
ganó). El organizador quiere notificaciones, pero **sin pedir correo ni celular**, para no romper la
facilidad y sencillez que define la app.

**Objetivo:** un sistema de notificaciones que (a) no pida ningún dato personal, (b) avise a todos
dentro de la app sin fricción, y (c) opcionalmente alcance al jugador **con la app cerrada** para
quien lo active.

## 2. Alcance

**Incluye:**

- **In-app (universal):** centro de avisos por jugador y por admin, contador de no leídos (badge) y
  *toasts* (`sonner`) cuando llega algo nuevo. Cero permisos, cero datos personales.
- **Web Push (opt-in):** notificaciones del navegador (estándar VAPID) que llegan con la app
  cerrada, atadas a una **suscripción anónima del navegador** (ni correo ni teléfono). Requiere
  convertir la app en **PWA** y pedir permiso una vez.
- **Eventos** (los 4 grupos acordados):
  - *Partidos de tu equipo:* `match_soon` (~1 h antes) y `match_result` (al terminar).
  - *Tu suerte en la quiniela:* `team_eliminated`, `disqualified`, `champion_won`.
  - *Ciclo de la quiniela:* `teams_assigned`, `quiniela_closed`, `tournament_started`.
  - *Para el admin:* `player_joined`, `ready_to_distribute`.

**No incluye (trabajo futuro, §14):**

- Notificaciones por **correo o SMS** (rompe la restricción central).
- Eventos de **pago** ("te confirmaron tu cuota") — el tracking de pagos existe, pero notificarlo no
  se pidió; se deja como futuro.
- Preferencias finas por tipo de evento (silenciar categorías). Phase 1/2 entregan todo o nada de
  push; el silenciado por tipo es futuro.
- Canales de terceros (Telegram, ntfy) — obligan a instalar/usar otra app; descartados por sencillez.
- Agrupar/expirar avisos viejos, historial paginado. El feed devuelve los últimos N.

## 3. Decisiones de arquitectura

### 3.1 Híbrido: in-app primero, push opcional encima

In-app cubre a **todos** sin permisos ni instalación y reaprovecha que Convex ya es reactivo
(el badge y el feed se actualizan solos) y que `sonner`/`<Toaster>` ya están montados. Web Push es un
**extra** para quien quiera alcance con la app cerrada; quien no lo active igual recibe todo al abrir.

### 3.2 Identidad sin cuentas

Un aviso pertenece a un `participantId` (resuelto del `personalToken`) o al **admin** de una quiniela
(resuelto del `adminToken`, vía `audience: "admin"`). La suscripción de push guarda el
`endpoint`+claves **anónimos** del navegador, atados al mismo `participantId`/admin. No se añade
ningún dato personal: es del mismo tipo de identificador opaco que ya usa el `personalToken`.

### 3.3 Generación **en el origen** + `dedupeKey` como bitácora de idempotencia

Los avisos se **insertan como filas** (no se derivan en lectura), porque el push necesita un
momento-de-cambio en el servidor para dispararse. Dos relojes:

- **Por sincronización (cron `syncMatches`, cada 5 min):** `match_soon`, `match_result`,
  `team_eliminated`, `disqualified`, `champion_won`, `tournament_started`. Tras el `upsert` global,
  una mutación interna **itera las quinielas**, hace `resolveQuiniela` (estado efectivo con sus
  overrides) y propone avisos. **No se almacena un "estado previo"**: cada aviso lleva un `dedupeKey`
  determinista y solo se inserta si no existe ya uno con esa clave → emite-una-vez, idempotente y
  auto-reparable aunque el cron repita.
- **Por acción del usuario (mutations existentes):** `teams_assigned`, `quiniela_closed`,
  `player_joined`, `ready_to_distribute` se emiten dentro de `joinQuiniela`/`closeAndRedistribute`/
  `autoCloseDue`.

Esto respeta el **aislamiento por quiniela** de v1.5: como la detección usa `resolveQuiniela`, un
override en la quiniela A que elimina a un equipo genera el aviso **solo en A**.

La **lógica de decisión y el copy viven en un módulo puro** (`convex/lib/notify.ts`), igual que
`resolve.ts`/`tournament.ts`: recibe datos planos (estados, partidos efectivos, dueñerías, nombres,
`now`) y devuelve *intenciones* de aviso completas (`type`, destinatario, `dedupeKey`, `title`,
`body`). Fácil de cubrir con TDD; la mutación solo carga datos, llama al módulo, deduplica e inserta.

### 3.4 Canal de push: Web Push estándar (VAPID), sin terceros

Web Push del navegador con **VAPID** (Voluntary Application Server Identification): el servidor firma
los envíos con un par de claves propio; no hay servicio de terceros, no hay costo, no hay correo ni
teléfono. La clave **pública** se hornea en el cliente (como `VITE_CONVEX_URL`) para suscribir; la
**privada** vive solo en env de Convex. El envío corre en una **action Node** (`"use node"`) con la
librería `web-push`.

> ⚠️ **Riesgo a de-riskear (primera tarea de la Fase 2):** verificar que `web-push` bundlea y corre
> en una action Node de Convex. Si no, **plan B:** implementar el cifrado RFC 8291 / VAPID con
> `Web Crypto` en el runtime default (más código, mismo resultado). El resto del diseño no cambia.

### 3.5 Costura única: `insertNotification(ctx, intent)`

Un solo helper interno (en `convex/notifications.ts`, función normal que recibe `MutationCtx`) hace
el **insert** del aviso. Lo usan la detección del cron y todas las mutations. **La Fase 2 añade el
disparo de push en ese único lugar** (`ctx.scheduler.runAfter(0, internal.push.deliver, …)`), sin
tocar los call-sites. La deduplicación por `dedupeKey` vive aquí (lee `by_dedupe`, inserta si falta).

## 4. Modelo de datos

Cambios **aditivos** (sin migración; el torneo no ha arrancado, no hay avisos previos):

```ts
notifications: defineTable({
  quinielaId: v.id("quinielas"),
  audience: v.string(),                  // "participant" | "admin"
  participantId: v.optional(v.id("participants")), // destinatario (ausente si audience="admin")
  type: v.string(),                      // ver §10
  title: v.string(),
  body: v.string(),
  matchId: v.optional(v.id("matches")),  // payload para deep-link / render
  teamId: v.optional(v.id("teams")),
  createdAt: v.number(),
  readAt: v.optional(v.number()),        // ausente = no leído
  dedupeKey: v.string(),                 // emite-una-vez (ver §3.3)
})
  .index("by_participant", ["participantId", "createdAt"])
  .index("by_quiniela_audience", ["quinielaId", "audience", "createdAt"])
  .index("by_dedupe", ["dedupeKey"]),

pushSubscriptions: defineTable({         // Fase 2
  quinielaId: v.id("quinielas"),
  audience: v.string(),                  // "participant" | "admin"
  participantId: v.optional(v.id("participants")),
  endpoint: v.string(),
  p256dh: v.string(),
  auth: v.string(),
  createdAt: v.number(),
})
  .index("by_participant", ["participantId"])
  .index("by_quiniela_audience", ["quinielaId", "audience"])
  .index("by_endpoint", ["endpoint"]),   // dedupe de suscripción + limpieza en 404/410
```

`dedupeKey` convención: `${quinielaId}:${type}:${matchId ?? teamId ?? ""}:${participantId ?? "admin"}`
(el helper lo arma; las claves de quiniela-única como `quiniela_closed` omiten match/team).

## 5. Capa pura — `convex/lib/notify.ts` (pura, testeable)

```ts
export type NotifyIntent = {
  audience: "participant" | "admin";
  participantId: string | null;
  type: string;
  title: string;
  body: string;
  matchId: string | null;
  teamId: string | null;
  dedupeKey: string;
};

// Eventos por sincronización para UNA quiniela, a partir de su estado derivado.
export function detectSyncEvents(input: {
  quinielaId: string;
  now: number;
  soonMs: number;                 // ventana de "juega pronto" (p.ej. 65 min)
  tournamentStarted: boolean;     // now >= primer kickoff
  teams: { id: string; name: string; flag: string }[];
  effMatches: MatchRow[];         // partidos efectivos (global + overrides)
  states: Map<string, TeamState>;
  ownerByTeam: Map<string, string>;       // teamId -> participantId (en esta quiniela)
  participants: { id: string; name: string; teamCount: number }[];
}): NotifyIntent[];

// Constructores de copy para eventos por acción (puros).
export function teamsAssignedNotice(quinielaId, participantId, teamCount): NotifyIntent;
export function quinielaClosedNotice(quinielaId, participantId): NotifyIntent;
export function playerJoinedNotice(quinielaId, joinerName, participantId): NotifyIntent; // audience admin
export function readyToDistributeNotice(quinielaId): NotifyIntent;                       // audience admin
```

`MatchRow`/`TeamState` se reutilizan de `convex/lib/tournament.ts`. El copy es español, corto y con
emoji (consistente con la UI). La función **no** lee la DB ni deduplica: solo decide intenciones.

## 6. Backend (Convex)

### 6.1 Costura de inserción — `convex/notifications.ts`

- `insertNotification(ctx, intent)` (helper, no es función Convex): si no existe fila con
  `intent.dedupeKey` (índice `by_dedupe`), inserta `{ ...intent, createdAt: Date.now(), readAt: undefined }`.
  **Fase 2:** tras insertar, agenda `internal.push.deliver({ notificationId })`.
- `detectFromSync` (`internalMutation`): itera `quinielas`; por cada una `resolveQuiniela` + carga
  dueñerías/participantes; arma los inputs planos; llama `detectSyncEvents`; `insertNotification` por
  intención. Se llama al final de `syncMatches` (después de `autoCloseDue`).

### 6.2 Eventos por acción (mutations existentes)

- **`joinQuiniela`** (`participants.ts`): tras crear al participante → `playerJoinedNotice` (admin);
  si en modo `on_join` recibió equipos → `teamsAssignedNotice` (al jugador); si la quiniela quedó
  **llena** (`k+1 === numParticipants`) → `readyToDistributeNotice` (admin).
- **`closeAndRedistribute`** y **`autoCloseDue`** (`quinielas.ts`): al pasar a `locked` →
  `quinielaClosedNotice` a **todos** los participantes; en modo `on_reveal` (recién reciben equipos)
  → `teamsAssignedNotice` a cada uno.

### 6.3 Lectura y marcado (queries/mutations nuevas en `notifications.ts`)

- `listForParticipant({ personalToken })` → `{ items: Notif[], unreadCount }` (índice
  `by_participant`, orden desc, tope ~50).
- `listForAdmin({ adminToken })` → ídem para `audience: "admin"` (índice `by_quiniela_audience`).
- `markRead({ personalToken? , adminToken?, ids? })` → marca `readAt` en los avisos del destinatario
  (todos o los `ids` dados). Autoriza por el token correspondiente.

### 6.4 Push (Fase 2)

- `savePushSubscription({ personalToken | adminToken, endpoint, p256dh, auth })` → *upsert* por
  `endpoint` atado al destinatario.
- `removePushSubscription({ endpoint })` → borra (opt-out / limpieza).
- `push.deliver({ notificationId })` (`internalAction`, `"use node"`): carga el aviso y las
  suscripciones del destinatario; envía con `web-push` y la firma VAPID; en **404/410** borra la
  suscripción muerta (vía una mutación interna `pruneSubscription`). La **decisión** de qué endpoints
  podar a partir de los resultados de envío se factoriza como función pura testeable.

## 7. Tipos (`convex/types.ts`)

- `NotificationItem = { id: string; type: string; title: string; body: string; createdAt: number; read: boolean }`.
- `NotificationsData = { items: NotificationItem[]; unreadCount: number }`.
- (El `audience`/`dedupeKey`/payload no se exponen al cliente.)

## 8. Frontend

### 8.1 In-app (Fase 1)

- **`src/components/NotificationBell.tsx`** (nuevo): campana con badge de no leídos; al abrir, un
  panel (sheet/popover) lista los avisos y dispara `markRead`. Recibe `{ token, kind: "me" | "admin" }`.
- Se monta en el header de **`Personal.tsx`** (`kind:"me"`) y **`Admin.tsx`** (`kind:"admin"`).
- **`src/lib/useNotificationToasts.ts`** (nuevo): hook que, dado el feed reactivo, dispara `toast()`
  para los avisos con `createdAt` mayor al último visto, guardando el corte en `localStorage`
  (`quiniela:<id>:notifseen:<kind>`) para no re-anunciar lo viejo al cargar.
- `<Toaster>` ya está montado en `main.tsx` — no hay cambios ahí en Fase 1.

### 8.2 Push opt-in (Fase 2)

- **PWA:** `public/manifest.webmanifest` + iconos (a partir de `favicon.svg`/`icons.svg`), `<link
  rel="manifest">` y `<meta name="theme-color">` en `index.html`, y un **service worker**
  `public/sw.js` que maneja `push` (muestra la notificación) y `notificationclick` (abre el link).
- Registro del SW en `main.tsx` (`navigator.serviceWorker.register("/sw.js")`, con guarda de soporte).
- **`src/lib/usePushSubscription.ts`** (nuevo, plantilla = `usePhotoUpload.ts`): expone
  `{ supported, enabled, enabling, enable(), disable() }`. `enable()` pide permiso, suscribe con
  `VITE_VAPID_PUBLIC_KEY` y llama `savePushSubscription`; `disable()` desuscribe y `removePushSubscription`.
- **Botón de opt-in** en `Personal.tsx` y `Admin.tsx`: *"🔔 Avisarme aunque cierre la app"*. En iOS,
  si no está en `display-mode: standalone`, muestra la instrucción de "Agregar a pantalla de inicio".

## 9. iOS y permisos

- Web Push en iPhone (Safari, iOS 16.4+) **solo** funciona si la app se agregó a la pantalla de
  inicio (modo standalone). En Android/escritorio funciona en el navegador normal.
- Se detecta standalone con `window.matchMedia("(display-mode: standalone)")` (y `navigator.standalone`
  en iOS). Si no, el botón explica el paso de instalar antes de pedir permiso.
- Si `Notification.permission === "denied"`, el botón queda informativo (no se puede re-pedir).
- **In-app no pide nada de esto:** es el piso universal.

## 10. Eventos → disparador → destinatario

| `type` | Disparador | Destinatario | `dedupeKey` (sufijo) |
|---|---|---|---|
| `match_soon` | cron: partido `scheduled` con kickoff en `[now, now+soonMs]` y equipo con dueño | dueño(s) del equipo | `match_soon:<matchId>:<participantId>` |
| `match_result` | cron: partido efectivo pasó a `finished` con equipo con dueño | dueño(s) del equipo | `match_result:<matchId>:<participantId>` |
| `team_eliminated` | cron: equipo con dueño quedó `!alive` (derivado) | dueño del equipo | `team_eliminated:<teamId>:<participantId>` |
| `disqualified` | cron: participante con equipos y `aliveCount === 0` | el participante | `disqualified::<participantId>` |
| `champion_won` | cron: `championTeamId` resuelto | dueño del campeón | `champion_won::<participantId>` |
| `tournament_started` | cron: `now >= primer kickoff` | todos los participantes | `tournament_started::<participantId>` |
| `teams_assigned` | mutación: el jugador recibió equipos | el jugador | `teams_assigned::<participantId>` |
| `quiniela_closed` | mutación: la quiniela pasó a `locked` | todos los participantes | `quiniela_closed::<participantId>` |
| `player_joined` | `joinQuiniela` | admin | `player_joined:<participantId>:admin` |
| `ready_to_distribute` | `joinQuiniela` dejó la quiniela llena | admin | `ready_to_distribute::admin` |

## 11. Fases (cada una desplegable y con valor)

- **Fase 1 — In-app (sin PWA, sin permisos):** schema `notifications`; `lib/notify.ts`;
  `insertNotification` + `detectFromSync` + enganche en `syncMatches`; eventos por acción en las
  mutations; queries `listFor*` + `markRead`; `NotificationBell` + `useNotificationToasts` en Personal
  y Admin. Da valor a **todos** de inmediato.
- **Fase 2 — Web Push (opt-in):** schema `pushSubscriptions`; PWA (manifest + iconos + `sw.js` +
  registro); claves VAPID (env); `push.deliver` (Node) + poda de muertas; `save/removePushSubscription`;
  `usePushSubscription` + botón opt-in; añadir el disparo de push dentro de `insertNotification`.

## 12. Pruebas (TDD estricto)

**Puro** (`convex/lib/notify.test.ts`): cada transición produce la intención correcta con su
`dedupeKey`; partidos sin dueño no generan nada; `disqualified` solo con equipos y 0 vivos; copy
correcto (singular/plural, nombres). Poda de suscripciones (función pura): dada la lista de
resultados de envío, devuelve los endpoints a borrar.

**Integración** (`convex/notifications.test.ts`, convex-test edge-runtime):
- `detectFromSync` emite `match_result`/`team_eliminated`/`disqualified`/`champion_won` al dueño
  correcto; **idempotente** (segunda corrida no duplica).
- **Aislamiento por quiniela:** override en A que elimina un equipo → `team_eliminated` en A y
  **ninguno** en B.
- `match_soon` se dispara dentro de la ventana (kickoff parcheado a `now+30min`) y una sola vez.
- `joinQuiniela`: `player_joined` (admin) + `teams_assigned` (on_join); al llenarse,
  `ready_to_distribute`.
- `closeAndRedistribute`/`autoCloseDue`: `quiniela_closed` a todos; `teams_assigned` en `on_reveal`.
- `listForParticipant`/`listForAdmin`: items + `unreadCount`; `markRead` marca; tokens ajenos lanzan.
- **Fase 2:** `save/removePushSubscription` (CRUD + auth); upsert por `endpoint`.

**Front (jsdom):** `NotificationBell` muestra el badge y marca leído; `useNotificationToasts` dispara
toast solo para lo nuevo (no re-anuncia lo viejo tras recargar).

**E2E (Playwright):** Fase 1 — dos quinielas, generar un evento, verla en el feed/badge de una y
**no** en la otra (aislamiento). Fase 2 — flujo de opt-in con permiso concedido (mock) y que la
suscripción se guarda; 0 errores de consola.

## 13. Despliegue

Orden del proyecto: **backend antes que frontend** (el front nuevo llama funciones nuevas). Fase 1:
`npx convex deploy` + `railway up`. Fase 2 además: `npx convex env set VAPID_PUBLIC_KEY/…` (dev y
`--prod`) y `VITE_VAPID_PUBLIC_KEY` en Railway **antes** del build (se hornea como `VITE_CONVEX_URL`).
`convex/_generated/` se commitea. No desplegar sin autorización explícita del usuario.

## 14. Trabajo futuro

| # | Trabajo | Esfuerzo | Valor |
|---|---------|----------|-------|
| 1 | Preferencias por tipo de evento (silenciar categorías) | Bajo | Medio |
| 2 | Evento de pago ("te confirmaron tu cuota") | Bajo | Medio |
| 3 | Expiración/paginación del historial de avisos | Bajo | Bajo |
| 4 | Reintentos/backoff en `push.deliver` ante fallos transitorios | Medio | Medio |

## 15. Decisiones

| Tema | Decisión |
|------|----------|
| Sin datos personales | In-app por `participantId`/admin; push por suscripción anónima del navegador (VAPID). |
| In-app vs push | Híbrido: in-app universal (piso), push opt-in (alcance con app cerrada). |
| Generación | En el origen (filas), no derivada; `dedupeKey` = bitácora de emite-una-vez. |
| Aislamiento | La detección por cron usa `resolveQuiniela` → un override no cruza quinielas. |
| Costura de push | Un único `insertNotification`; la Fase 2 agrega el envío ahí. |
| Canal push | Web Push estándar (VAPID), sin terceros; envío en action Node con `web-push`. |
| iOS | Requiere PWA "agregar a inicio"; el opt-in lo guía. In-app no requiere nada. |
| Lógica testeable | Decisión y copy en `lib/notify.ts` puro; la mutación solo carga, deduplica e inserta. |

## 16. Self-review

- Sin placeholders ni TODOs; firmas y `dedupeKey` definidos (§4–§6, §10).
- Consistente con v1.5 (deriva por quiniela) y con el schema actual (notas/pagos no se tocan).
- Acotado a dos planes de fase encadenables; cada fase entrega valor sola.
- Ambigüedad resuelta: idempotencia por `dedupeKey` (no hay "estado previo"); push centralizado en
  `insertNotification`; in-app no pide permisos; el riesgo de `web-push` se de-riskea en la 1ª tarea
  de la Fase 2 con plan B explícito.
