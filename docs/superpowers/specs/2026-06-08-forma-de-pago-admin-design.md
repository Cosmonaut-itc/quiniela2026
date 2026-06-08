# Diseño — Forma de pago (efectivo / transferencia) en el panel de administración

**Fecha:** 2026-06-08
**Estado:** Aprobado, listo para plan de implementación.
**Idioma:** Español (UI, docs y commits).
**Spec base:** `docs/superpowers/specs/2026-06-06-notas-y-tracking-pagos-design.md` (este documento extiende el tracking de pagos del modo `per_person` añadiendo la forma de pago).

## 1. Contexto y problema

Hoy el panel del admin permite marcar por participante un único estado **Pagó / Pendiente**
(modo `per_person`), que alimenta el bote (`prizeView(qn, paidCount)`). El admin quiere, además de
saber **si** alguien pagó, registrar **cómo** pagó: **efectivo** o **transferencia**, para llevar un
mayor control de las participaciones (cuánto dinero está en mano vs. en cuenta).

## 2. Alcance

**Incluye:**

- Clasificar el pago de cada participante en tres estados: **Pendiente / Efectivo / Transferencia**
  (solo modo `per_person`, donde vive el pago hoy), visible y editable **solo por el admin**.
- **Desglose por método** en la tarjeta del bote del panel admin: cuánto entró en efectivo y cuánto
  por transferencia.

**No incluye (trabajo futuro):**

- Más métodos de pago (tarjeta, depósito, etc.). Solo efectivo / transferencia.
- Timestamp del pago, o registro de **quién** lo marcó. El admin único por token sigue siendo el
  responsable.
- Mostrar la forma de pago a los usuarios. Sigue siendo información solo del admin; los usuarios solo
  ven el bote confirmado (sin cambios).
- Tracking de método en modo `fixed` (no hay cuota; no aplica).
- Migración de datos. Las filas ya marcadas como pagadas (sin método) se respetan tal cual.

## 3. Decisiones de arquitectura

### 3.1 Campo aditivo `paymentMethod`, sin tocar `paid`

Se añade **un** campo opcional a `participants`, conservando `paid` como hoy:

```ts
paid: v.optional(v.boolean()),                    // igual que hoy → alimenta el bote
paymentMethod: v.optional(
  v.union(v.literal("efectivo"), v.literal("transferencia"))
), // solo si paid; ausente = sin clasificar (incluye filas legacy)
```

**Invariante:** si hay `paymentMethod`, entonces `paid === true`. Lo garantiza la mutación (único
punto de escritura). `paid` sigue siendo la **única fuente de verdad** para "¿pagó?", de modo que la
lógica del bote (`prizeView(qn, paidCount)`, con `paidCount = participants.filter(p => p.paid === true)`)
**no cambia ni de fórmula ni de riesgo**.

**Datos legacy:** las filas ya pagadas sin método (`paid: true`, sin `paymentMethod`) siguen contando
en el bote y se muestran como "✓ Pagó" (sin clasificar) hasta que el admin las reclasifique. **No
requiere migración** porque el campo es opcional.

**Alternativa descartada:** colapsar `paid` + método en un único campo `paymentStatus`
(`"efectivo" | "transferencia"`, ausente = pendiente). Más limpio en teoría, pero perdería el estado
"pagó, método desconocido" que ya existe en producción, y obligaría a tocar la lógica del bote.

### 3.2 Una sola mutación con el estado destino

Como el control de UI es un menú de 3 estados, la mutación recibe el **estado destino** en vez de un
booleano. Reemplaza a `setParticipantPaid` (una sola fuente de verdad; se actualizan sus 3 call-sites
de test). Ver §5.

### 3.3 Desglose solo en `AdminData`, no en `PrizeView`

El desglose por método es información **solo del admin**. Para no ampliar el `PrizeView` compartido
(que también consumen `getOverview` y `getPersonalPanel`), los conteos por método se añaden a
`AdminData.quiniela`, no a `PrizeView`. El "sin clasificar" se deriva en el front como
`contributors − efectivo − transferencia`.

## 4. Modelo de datos

Cambio **aditivo** (sin migración; filas viejas siguen funcionando):

```ts
participants: defineTable({
  // ...campos existentes...
  paid: v.optional(v.boolean()), // solo relevante en per_person; ausente = no pagó
  paymentMethod: v.optional(
    v.union(v.literal("efectivo"), v.literal("transferencia"))
  ), // solo si paid; ausente = sin clasificar (incluye filas legacy)
  // ...
})
```

## 5. Backend (Convex)

### 5.1 Mutación `setParticipantPayment` (reemplaza a `setParticipantPaid`)

```ts
setParticipantPayment({
  adminToken: v.string(),
  participantId: v.id("participants"),
  method: v.union(v.literal("pending"), v.literal("efectivo"), v.literal("transferencia")),
})
```

- Carga el participante; carga su quiniela; **autoriza** verificando `quiniela.adminToken === adminToken`
  (si no, lanza `"No autorizado"`), igual que `setParticipantPaid` hoy.
- Aplica el patch según el estado destino:
  - `"pending"` → `{ paid: undefined, paymentMethod: undefined }`
  - `"efectivo"` → `{ paid: true, paymentMethod: "efectivo" }`
  - `"transferencia"` → `{ paid: true, paymentMethod: "transferencia" }`
- Borrar el campo con `undefined` sigue la convención existente del schema (igual que
  `paid: args.paid || undefined`).
- Funciona en cualquier estado (open/locked/finished), como hoy (permite registrar pagos tardíos).

Se elimina `setParticipantPaid`. Sus call-sites de test (`participants.test.ts`, `quinielas.test.ts`)
migran a la nueva mutación.

### 5.2 Query `getAdmin`

- Cada entrada de `participants` gana `paymentMethod: "efectivo" | "transferencia" | null`
  (`p.paymentMethod ?? null`).
- `quiniela` gana `methodCounts: { efectivo: number; transferencia: number }`, calculados sobre los
  participantes (`participants.filter(p => p.paymentMethod === "efectivo").length`, etc.).
- `paidCount` y el resto del cálculo del bote **no cambian**.

`prizeView` en `convex/lib/view.ts` **no cambia de firma** ni de lógica.

## 6. Tipos (`convex/types.ts`)

- `AdminData.participants[]` += `paymentMethod: "efectivo" | "transferencia" | null`.
- `AdminData.quiniela` += `methodCounts: { efectivo: number; transferencia: number }`.

## 7. Frontend

### 7.1 Componente de menú nuevo

- **`src/components/ui/dropdown-menu.tsx`** — wrapper estilo shadcn sobre el `Menu` de
  **`@base-ui/react/menu`**. El proyecto **ya usa Base UI** (`@base-ui/react`, mismo paquete de
  `dialog.tsx`/`button.tsx`), así que **no se añade ninguna dependencia**. Provee el menú accesible
  (teclado, foco, click-fuera, escape) sin hand-rollearlo. Solo se exportan las partes necesarias
  (`Root`/`Trigger`/`Content`/`Item`). Verificado por spike: el `Menu` de Base UI abre y dispara
  `onClick` bajo jsdom sin polyfills, por lo que la interacción es testeable en unit.

### 7.2 Componente nuevo `PaymentStatusMenu`

- **`src/components/PaymentStatusMenu.tsx`** (+ `PaymentStatusMenu.test.tsx`), siguiendo el patrón de
  `PlayerRow` (componente presentacional con su test en jsdom).
- **Props:**
  ```ts
  {
    method: "efectivo" | "transferencia" | null;
    paid: boolean;
    disabled?: boolean;
    onSelect: (next: "pending" | "efectivo" | "transferencia") => void;
  }
  ```
- **Botón-pastilla** que muestra el estado actual:
  - `paid === false` → `"Pendiente"` (estilo muted, como hoy).
  - `paid && method === "efectivo"` → `"✓ Efectivo"` (estilo `alive`).
  - `paid && method === "transferencia"` → `"✓ Transferencia"` (estilo `alive`).
  - `paid && method === null` (legacy) → `"✓ Pagó"` (estilo `alive`).
- Al tocar abre un menú con tres ítems (**Pendiente / ✓ Efectivo / ✓ Transferencia**) marcando el
  actual; al elegir, llama `onSelect` con el valor correspondiente. `disabled` lo deshabilita
  mientras se guarda.

### 7.3 `Admin.tsx`

- Sustituye la mutación: `setPayment = useMutation(api.participants.setParticipantPayment)`.
- Reemplaza el toggle Pagó/Pendiente por `<PaymentStatusMenu>`, cableado a
  `setPayment({ adminToken, participantId: p.id, method })`. Mantiene el patrón de "guardando" por id
  (`savingPaymentId`) para deshabilitar la fila durante la mutación.
- En la tarjeta del bote (`per_person`), debajo de `{pagados}/{inscritos} pagados …`, añade una línea
  de desglose **solo si `paidCount > 0`**:
  `Efectivo: $A · Transferencia: $B` y, **solo si `sinClasificar > 0`**, `· Sin clasificar: $C`,
  donde `A = efectivo × entryFee`, `B = transferencia × entryFee`,
  `sinClasificar = contributors − efectivo − transferencia`, `C = sinClasificar × entryFee`.
  Reusa `formatMXN` y el patrón de cálculo de `pendingPesos` ya presente.
- En modo `fixed` no se muestra ni el menú ni el desglose (igual que hoy con el toggle).

### 7.4 Usuarios (Join / Personal)

Sin cambios. Solo ven el bote confirmado; nunca ven el método de pago ni quién pagó.

## 8. Manejo de errores

- `setParticipantPayment`: si el participante/quiniela no existe o el `adminToken` no corresponde,
  lanza `Error` en español; el front muestra `toast.error` (mismo patrón que `onTogglePaid` hoy).

## 9. Pruebas

**Backend (TDD):**

- `setParticipantPayment`:
  - `"efectivo"` → `paid === true` y `paymentMethod === "efectivo"`.
  - `"transferencia"` → `paid === true` y `paymentMethod === "transferencia"`.
  - `"pending"` → limpia `paid` y `paymentMethod` (ambos ausentes).
  - cambio `efectivo` → `transferencia` actualiza el método y mantiene `paid`.
  - `adminToken` ajeno → lanza.
  - el bote cuenta a todos los pagados sin importar el método (un pago en efectivo y uno por
    transferencia → `contributors === 2`).
- `getAdmin`: participantes traen `paymentMethod`; `quiniela.methodCounts` refleja los conteos
  correctos.
- Regresión modo `fixed`: sin cambios de bote.

**Front (unit):**

- `PaymentStatusMenu`: muestra la etiqueta correcta por estado (`Pendiente`, `✓ Efectivo`,
  `✓ Transferencia`, `✓ Pagó` legacy); abrir el menú y elegir un ítem dispara `onSelect` con el valor
  esperado.

**Verificación manual (Playwright MCP, no hay suite E2E automatizada en el proyecto):** en una
quiniela `per_person`, marcar a un participante como Efectivo y a otro como Transferencia desde el
admin → el desglose del bote muestra los montos correctos por método; el bote total no cambia
respecto a marcarlos solo como "Pagó".

## 10. Plan de despliegue

Mismo orden del proyecto: **backend antes que frontend** (el front llama la mutación nueva y lee
`methodCounts`/`paymentMethod`, que el backend debe exponer primero). Deploy manual front+back juntos
tras validar (`npm test`, `npm run build`, `npm run lint`, E2E).
