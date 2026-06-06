# Diseño — Notas generales + tracking de pagos por participación

**Fecha:** 2026-06-06
**Estado:** Aprobado, listo para plan de implementación.
**Idioma:** Español (UI, docs y commits).
**Spec base:** `docs/superpowers/specs/2026-06-06-premio-por-participacion-design.md` (este documento añade notas y refina el cálculo del bote del modo `per_person`).

## 1. Contexto y problema

Dos necesidades nuevas del organizador (admin):

1. **Notas generales.** Hoy no hay forma de comunicar reglas, fechas de pago, sede, o cualquier
   aviso a los participantes dentro de la app. El admin quiere un espacio de texto libre que se
   muestre en el **área general** de la quiniela y que pueda editar en cualquier momento.

2. **Tracking de pagos (modo `per_person`).** Hoy el bote del modo por participación se calcula como
   `cuota × inscritos` (`filledCount`). Esto asume que todo inscrito ya pagó, lo cual infla el bote
   y genera expectativas irreales cuando alguien se inscribió pero **aún no dio su cuota**. El admin
   quiere llevar el control de **quién ya pagó** y que el bote mostrado a todos refleje **solo los
   pagos confirmados**.

## 2. Alcance

**Incluye:**

- **Notas:** campo de texto libre por quiniela, editable por el admin en cualquier momento, visible
  en el área general (overview) para todos.
- **Pagos:** marca de "pagó / pendiente" por participante (solo modo `per_person`), visible y
  editable **solo por el admin**; el bote mostrado a los usuarios pasa a ser `cuota × pagados`.

**No incluye (trabajo futuro):**

- Notas con formato enriquecido (markdown, links clicables, imágenes). Solo texto plano con saltos
  de línea.
- Mostrar las notas en el panel personal (`me`) — acordado: solo en el área general.
- Mostrar a los usuarios **quién** pagó o cuántos faltan — solo el admin ve el detalle; los usuarios
  solo ven el bote confirmado.
- Cobro real / pasarela de pago. El pago sigue ocurriendo fuera de la app; el admin solo lo registra.
- Tracking de pagos en modo `fixed` (no hay cuota; no aplica).

## 3. Decisiones de arquitectura

### 3.1 Notas

Campo aditivo `notes: v.optional(v.string())` en `quinielas`, mismo patrón que el resto de campos
opcionales. Texto plano, tope ~1000 caracteres, se preservan saltos de línea al renderizar
(`whitespace-pre-wrap`). Ausente o `""` = sin notas (no se muestra la tarjeta).

### 3.2 Pagos — reusar `contributors`, no añadir campo a `PrizeView`

El tipo `PrizeView` ya tiene `contributors: number` y calcula `pool = entryFee × contributors`.
Hoy le pasamos `filledCount` (inscritos). **El único cambio es pasarle `paidCount`** (cuántos
pagaron). El nombre `contributors` ("quienes contribuyeron") ya describe exactamente "quienes
pagaron", así que no hace falta renombrar ni añadir campos; solo se actualiza el comentario del tipo.

El estado de pago vive en un campo aditivo `paid: v.optional(v.boolean())` en `participants`.
**Ausente = no pagó** (default acordado: cada quien entra como pendiente y el admin confirma al
recibir el dinero). Esto cambia el comportamiento del "bote en vivo": ahora crece conforme el admin
**confirma pagos**, no conforme la gente se inscribe.

**Alternativa descartada:** añadir un `paidCount` separado a `PrizeView` y dejar `contributors` =
inscritos. Más campos y wiring sin beneficio; reusar `contributors` es más limpio.

## 4. Modelo de datos

Cambios **aditivos** (sin migración; filas viejas siguen funcionando):

```ts
quinielas: defineTable({
  // ...campos existentes...
  notes: v.optional(v.string()), // texto libre del admin; ausente/"" = sin notas
  // ...
})

participants: defineTable({
  // ...campos existentes...
  paid: v.optional(v.boolean()), // solo relevante en per_person; ausente = no pagó
  // ...
})
```

## 5. Backend (Convex)

### 5.1 Notas

- **`createQuiniela`** — nuevo arg `notes: v.optional(v.string())`. Se guarda `notes.trim().slice(0, 1000)`;
  si queda vacío, se omite el campo (no se guarda `""`).
- **`updateNotes` (mutación nueva)** — args `{ adminToken: v.string(), notes: v.string() }`. Busca la
  quiniela por `by_adminToken`, lanza si no existe, y hace `patch({ notes: notes.trim().slice(0, 1000) })`.
  Acepta cadena vacía para **limpiar** las notas. No depende del estado (open/locked/finished).
- **`getOverview`** — añade `notes: string | null` a `quiniela` (devuelve `qn.notes ?? null` con
  trim; `""` → `null`).
- **`getAdmin`** — añade `notes: string | null` a `quiniela` (para precargar el editor).

### 5.2 Pagos

- **`setParticipantPaid` (mutación nueva)** — args `{ adminToken: v.string(), participantId: v.id("participants"), paid: v.boolean() }`.
  Carga el participante; carga su quiniela; **autoriza** verificando `quiniela.adminToken === adminToken`
  (si no, lanza "No autorizado"). Hace `patch(participantId, { paid })`. Funciona en cualquier estado
  (permite registrar pagos tardíos tras el cierre).
- **`getOverview` / `getPersonalPanel`** — calculan `paidCount = participants.filter(p => p.paid === true).length`
  y llaman `prizeView(qn, paidCount)` en vez de `prizeView(qn, participants.length)`. `filledCount`
  (inscritos) **no cambia**: sigue siendo `participants.length` para "X de Y lugares".
- **`getAdmin`** — cada entrada de `participants` gana `id: string` (el `_id`) y `paid: boolean`
  (`p.paid === true`). El objeto `prize` ya se devuelve y ahora refleja el bote confirmado.

`prizeView` y `prizeModeOf` en `convex/lib/view.ts` **no cambian de firma**; solo cambia el número
que se les pasa. Se actualiza el comentario de `PrizeView.contributors` en `convex/types.ts`:
`// per_person: cuántos han PAGADO (definen el bote). fixed: irrelevante.`

## 6. Tipos (`convex/types.ts`)

- `OverviewData.quiniela` += `notes: string | null`.
- `AdminData.quiniela` += `notes: string | null`.
- `AdminData.participants[]` += `id: string` y `paid: boolean`.
- Comentario de `PrizeView.contributors` actualizado (ver §5.2).

## 7. Frontend

### 7.1 Componente nuevo

- **`src/components/ui/textarea.tsx`** — textarea estilo shadcn, consistente con `input.tsx`
  (mismas clases base de borde/foco/disabled). No existe hoy.

### 7.2 Notas

- **`Home.tsx`** (formulario de creación) — campo `Notas (opcional)` con `Textarea`
  (`maxLength={1000}`, placeholder tipo "Reglas, fecha límite de pago, sede…"). Se manda en
  `createQuiniela({ ..., notes })`.
- **`Join.tsx`** (área general) — si `quiniela.notes`, una tarjeta "Notas" (encabezado con
  `SectionHeading` + cuerpo con `whitespace-pre-wrap`) **debajo del banner de premio y antes de la
  tabla de jugadores**. Si no hay notas, no se renderiza nada.
- **`Admin.tsx`** — sección "Notas" con `Textarea` precargado desde `quiniela.notes`, estado local,
  y botón "Guardar notas" que llama `updateNotes` (toast de éxito/error). Editable siempre.

### 7.3 Pagos

- **`src/lib/format.ts` `prizeBanner`** — el subline del modo `per_person` cambia de
  `"× N inscritos"` a `"× N pagados"` (singular `pagado` / plural `pagados`). El caso cerrado se
  mantiene (`N × $fee`). El `pool`/`title` no cambian de fórmula (ya usan `contributors`, que ahora
  es `paidCount`).
- **`Home.tsx`** — copy del modo por participación: "el bote se arma con **quienes confirmen su
  pago**" (antes "con quien entre"), y el helper bajo "Máximo de participantes" alineado al nuevo
  modelo.
- **`Admin.tsx`** — solo cuando `quiniela.prize.mode === "per_person"`:
  - **Resumen** arriba de la lista de participantes: `Bote confirmado: ${pool} · {pagados}/{inscritos} pagados · ${pendientes} pendientes`, donde `pagados = prize.contributors`, `inscritos = filledCount`, `pendientes = entryFee × (filledCount − pagados)`.
  - **Por participante**: un toggle "Pagó / Pendiente" (botón con `aria-pressed`) que llama
    `setParticipantPaid({ adminToken, participantId: p.id, paid: !p.paid })`. Refleja `p.paid`.
  - En modo `fixed` no se muestra ni el resumen ni el toggle.
- **Usuarios (Join/Personal)**: solo ven el bote confirmado vía el banner. Nunca ven quién pagó.

## 8. Manejo de errores

- `updateNotes` / `setParticipantPaid`: si la quiniela/participante no existe o el `adminToken` no
  corresponde, lanzan `Error` con mensaje en español; el front muestra `toast.error`.
- Notas vacías: válido (limpia). Recorte a 1000 car. tanto en crear como en editar.

## 9. Pruebas

**Backend (TDD):**

- `createQuiniela` guarda `notes` recortado; `""`/espacios → sin notas.
- `updateNotes` actualiza, limpia con `""`, y lanza con `adminToken` inválido.
- `setParticipantPaid` marca/desmarca; lanza con `adminToken` ajeno; funciona tras el cierre.
- `getOverview`/`getPersonalPanel`: el bote = `cuota × pagados` (no inscritos); `filledCount` sigue
  siendo inscritos; `notes` en overview.
- `getAdmin`: participantes traen `id` + `paid`; `prize` refleja pagados; `notes` presente.
- Regresión modo `fixed`: sin cambios de bote ni toggle.

**Front (unit):**

- `prizeBanner` per_person abierto: `"$200 × 1 pagado"` / `"× 2 pagados"`; cerrado igual que antes.

**E2E (Playwright):** crear con notas → verlas en área general; editarlas en admin → reflejo en
general; modo per_person: marcar pagos en admin → el bote en Join/Personal sube en consecuencia;
quién pagó no aparece para usuarios.

## 10. Plan de despliegue

Mismo orden del proyecto: **backend antes que frontend** (el front nuevo manda `notes` a
`createQuiniela` y llama mutaciones nuevas que el backend debe aceptar primero). Deploy manual
front+back juntos tras validar (`npm test`, `npm run build`, `npm run lint`, E2E).
