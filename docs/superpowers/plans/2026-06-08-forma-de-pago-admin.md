# Forma de pago (efectivo/transferencia) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En el panel admin (`per_person`), clasificar el pago de cada participante en Pendiente / Efectivo / Transferencia y mostrar un desglose del bote por método.

**Architecture:** Campo aditivo `paymentMethod` en `participants` (sin tocar `paid`, que sigue alimentando el bote). Una mutación `setParticipantPayment` con el estado destino. `getAdmin` expone `paymentMethod` por participante y `methodCounts` por quiniela. UI: menú de 3 estados (`PaymentStatusMenu` sobre un wrapper de Base UI `Menu`) + línea de desglose en la tarjeta del bote.

**Tech Stack:** Convex (mutations/queries, `convex-test` + vitest/edge-runtime), React 19 + Base UI (`@base-ui/react`, ya instalado) + Tailwind, vitest/jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-08-forma-de-pago-admin-design.md`

**Nota de concurrencia:** otra sesión trabaja en el mismo árbol. En cada commit, **stagear solo rutas explícitas** (nunca `git add -A`/`.`).

---

### Task 1: Schema + mutación `setParticipantPayment`

**Files:**
- Modify: `convex/schema.ts` (tabla `participants`)
- Modify: `convex/participants.ts` (añadir `setParticipantPayment`, conservar `setParticipantPaid` por ahora)
- Test: `convex/participants.test.ts`

- [ ] **Step 1: Test que falla** — añadir al final de `convex/participants.test.ts`:

```ts
describe("setParticipantPayment", () => {
  async function joinOne() {
    const { t, q } = await setup(4);
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const ps = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    return { t, q, id: ps[0]._id };
  }

  it("efectivo: paid=true y método efectivo", async () => {
    const { t, q, id } = await joinOne();
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "efectivo" });
    const p = await t.run((ctx) => ctx.db.get(id));
    expect(p?.paid).toBe(true);
    expect(p?.paymentMethod).toBe("efectivo");
  });

  it("transferencia: paid=true y método transferencia", async () => {
    const { t, q, id } = await joinOne();
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "transferencia" });
    const p = await t.run((ctx) => ctx.db.get(id));
    expect(p?.paid).toBe(true);
    expect(p?.paymentMethod).toBe("transferencia");
  });

  it("pending limpia paid y método", async () => {
    const { t, q, id } = await joinOne();
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "efectivo" });
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "pending" });
    const p = await t.run((ctx) => ctx.db.get(id));
    expect(p?.paid).toBeUndefined();
    expect(p?.paymentMethod).toBeUndefined();
  });

  it("cambia de método y mantiene paid", async () => {
    const { t, q, id } = await joinOne();
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "efectivo" });
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "transferencia" });
    const p = await t.run((ctx) => ctx.db.get(id));
    expect(p?.paid).toBe(true);
    expect(p?.paymentMethod).toBe("transferencia");
  });

  it("rechaza un adminToken ajeno", async () => {
    const { t, id } = await joinOne();
    await expect(
      t.mutation(api.participants.setParticipantPayment, { adminToken: "ajeno", participantId: id, method: "efectivo" }),
    ).rejects.toThrow();
  });

  it("funciona tras cerrar la quiniela (pagos tardíos)", async () => {
    const { t, q } = await setup(4);
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    const ps = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: ps[0]._id, method: "efectivo" });
    const p = await t.run((ctx) => ctx.db.get(ps[0]._id));
    expect(p?.paid).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run convex/participants.test.ts`
Expected: FAIL (`setParticipantPayment` no existe; `paymentMethod` no validado por el schema).

- [ ] **Step 3: Añadir el campo al schema** — en `convex/schema.ts`, tabla `participants`, justo debajo de `paid`:

```ts
    paid: v.optional(v.boolean()), // solo relevante en per_person; ausente = no pagó
    paymentMethod: v.optional(
      v.union(v.literal("efectivo"), v.literal("transferencia")),
    ), // solo si paid; ausente = sin clasificar (incluye filas legacy)
```

- [ ] **Step 4: Implementar la mutación** — en `convex/participants.ts`, justo debajo del bloque `setParticipantPaid` (que se conserva por ahora):

```ts
export const setParticipantPayment = mutation({
  args: {
    adminToken: v.string(),
    participantId: v.id("participants"),
    method: v.union(v.literal("pending"), v.literal("efectivo"), v.literal("transferencia")),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.participantId);
    if (!p) throw new Error("Participante no encontrado");
    const qn = await ctx.db.get(p.quinielaId);
    if (!qn || qn.adminToken !== args.adminToken) throw new Error("No autorizado");
    // `paid` sigue siendo la fuente de verdad del bote. Invariante: si hay método,
    // paid=true. Al volver a "pending" se borran ambos (convención `|| undefined`).
    if (args.method === "pending") {
      await ctx.db.patch(args.participantId, { paid: undefined, paymentMethod: undefined });
    } else {
      await ctx.db.patch(args.participantId, { paid: true, paymentMethod: args.method });
    }
    return { ok: true as const };
  },
});
```

- [ ] **Step 5: Correr y ver pasar**

Run: `npx vitest run convex/participants.test.ts`
Expected: PASS (incluye los tests viejos de `setParticipantPaid`).

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/participants.ts convex/participants.test.ts
git commit -m "feat(pagos): mutación setParticipantPayment + campo paymentMethod"
```

---

### Task 2: `getAdmin` expone método + desglose; tipos

**Files:**
- Modify: `convex/types.ts` (`AdminData`)
- Modify: `convex/quinielas.ts` (`getAdmin`)
- Test: `convex/quinielas.test.ts`

- [ ] **Step 1: Test que falla** — añadir dentro de `describe("getAdmin", ...)` (o al final del archivo como `describe`) en `convex/quinielas.test.ts`:

```ts
it("expone el método de pago por participante y el desglose por método", async () => {
  const t = await seeded();
  const q = await t.mutation(api.quinielas.createQuiniela, {
    name: "Rifa", prizeText: "", numParticipants: 20, prizeMode: "per_person", entryFee: 200,
  });
  for (const name of ["Ana", "Beto"]) {
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name });
  }
  const ps = await t.run((ctx) =>
    ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
  await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: ps[0]._id, method: "efectivo" });
  await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: ps[1]._id, method: "transferencia" });
  const admin = await t.query(api.quinielas.getAdmin, { adminToken: q.adminToken });
  const byName = Object.fromEntries(admin.participants.map((p) => [p.name, p]));
  expect(byName["Ana"].paymentMethod).toBe("efectivo");
  expect(byName["Beto"].paymentMethod).toBe("transferencia");
  expect(admin.quiniela.methodCounts).toEqual({ efectivo: 1, transferencia: 1 });
  expect(admin.quiniela.prize.contributors).toBe(2); // ambos cuentan al bote
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run convex/quinielas.test.ts`
Expected: FAIL (`paymentMethod`/`methodCounts` no existen; error de tipo).

- [ ] **Step 3: Actualizar tipos** — en `convex/types.ts`, dentro de `AdminData`:

```ts
export type AdminData = {
  quiniela: { name: string; photoUrl: string | null; prize: PrizeView;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished";
              joinToken: string; assignMode: AssignMode; notes: string | null;
              methodCounts: { efectivo: number; transferencia: number } };
  participants: { id: string; name: string; personalToken: string; teamCount: number; paid: boolean;
                  paymentMethod: "efectivo" | "transferencia" | null }[];
  matches: { externalId: string; stage: string; label: string;
             homeTeam: TeamLite | null; awayTeam: TeamLite | null;
             homeExternalId: string | null; awayExternalId: string | null;
             homeScore: number | null; awayScore: number | null;
             status: string; winnerExternalId: string | null; manualOverride: boolean }[];
};
```

- [ ] **Step 4: Actualizar `getAdmin`** — en `convex/quinielas.ts`, junto a `const paidCount = ...` añadir los conteos, y exponerlos:

```ts
    const paidCount = participants.filter((p) => p.paid === true).length;
    const efectivoCount = participants.filter((p) => p.paymentMethod === "efectivo").length;
    const transferenciaCount = participants.filter((p) => p.paymentMethod === "transferencia").length;
```

En el objeto `quiniela` devuelto, añadir tras `notes`:

```ts
        notes: qn.notes ?? null,
        methodCounts: { efectivo: efectivoCount, transferencia: transferenciaCount },
```

En el `participants.map(...)`, añadir tras `paid`:

```ts
        paid: p.paid === true,
        paymentMethod: p.paymentMethod ?? null,
```

- [ ] **Step 5: Correr y ver pasar**

Run: `npx vitest run convex/quinielas.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/types.ts convex/quinielas.ts convex/quinielas.test.ts
git commit -m "feat(pagos): getAdmin expone paymentMethod y methodCounts"
```

---

### Task 3: UI — wrapper `dropdown-menu` + `PaymentStatusMenu`

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/PaymentStatusMenu.tsx`
- Test: `src/components/PaymentStatusMenu.test.tsx`

- [ ] **Step 1: Test que falla** — `src/components/PaymentStatusMenu.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaymentStatusMenu, paymentTriggerLabel } from "./PaymentStatusMenu";

describe("paymentTriggerLabel", () => {
  it("etiqueta correcta por estado", () => {
    expect(paymentTriggerLabel(false, null)).toBe("Pendiente");
    expect(paymentTriggerLabel(true, "efectivo")).toBe("✓ Efectivo");
    expect(paymentTriggerLabel(true, "transferencia")).toBe("✓ Transferencia");
    expect(paymentTriggerLabel(true, null)).toBe("✓ Pagó"); // legacy
  });
});

describe("PaymentStatusMenu", () => {
  it("el botón refleja el estado actual", () => {
    render(<PaymentStatusMenu paid={true} method="efectivo" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Estado de pago" }).textContent).toBe("✓ Efectivo");
  });

  it("abrir el menú y elegir un método dispara onSelect", async () => {
    const onSelect = vi.fn();
    render(<PaymentStatusMenu paid={false} method={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Estado de pago" }));
    fireEvent.click(await screen.findByText("Transferencia"));
    expect(onSelect).toHaveBeenCalledWith("transferencia");
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `npx vitest run src/components/PaymentStatusMenu.test.tsx`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Crear el wrapper** — `src/components/ui/dropdown-menu.tsx`:

```tsx
import { Menu as MenuPrimitive } from "@base-ui/react/menu";

import { cn } from "@/lib/utils";

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({ className, ...props }: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "min-w-44 origin-[var(--transform-origin)] rounded-xl bg-popover p-1 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "flex cursor-default items-center justify-between gap-2 rounded-lg px-2.5 py-2 outline-none select-none data-highlighted:bg-muted data-highlighted:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
```

- [ ] **Step 4: Crear el componente** — `src/components/PaymentStatusMenu.tsx`:

```tsx
import { CheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export type PaymentMethod = "efectivo" | "transferencia";
export type PaymentSelection = "pending" | PaymentMethod;

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
};

/** Etiqueta del botón según el estado de pago. Pura (fácil de testear). */
export function paymentTriggerLabel(paid: boolean, method: PaymentMethod | null): string {
  if (!paid) return "Pendiente";
  if (method) return `✓ ${METHOD_LABEL[method]}`;
  return "✓ Pagó"; // legacy: pagó sin método registrado
}

const ITEMS: { value: PaymentSelection; label: string }[] = [
  { value: "pending", label: "Pendiente" },
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
];

export function PaymentStatusMenu({
  paid,
  method,
  disabled,
  onSelect,
}: {
  paid: boolean;
  method: PaymentMethod | null;
  disabled?: boolean;
  onSelect: (next: PaymentSelection) => void;
}) {
  // Un pago legacy (paid sin método) marca "pending" en el check del menú, pero el
  // botón sigue mostrando "✓ Pagó" vía paymentTriggerLabel.
  const current: PaymentSelection = paid ? (method ?? "pending") : "pending";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label="Estado de pago"
        className={cn(
          "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
          paid
            ? "bg-alive/15 text-alive"
            : "bg-muted/60 text-muted-foreground hover:text-foreground",
        )}
      >
        {paymentTriggerLabel(paid, method)}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {ITEMS.map((it) => (
          <DropdownMenuItem key={it.value} onClick={() => onSelect(it.value)}>
            {it.label}
            {current === it.value && <CheckIcon className="size-3.5 text-alive" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 5: Correr y ver pasar**

Run: `npx vitest run src/components/PaymentStatusMenu.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/dropdown-menu.tsx src/components/PaymentStatusMenu.tsx src/components/PaymentStatusMenu.test.tsx
git commit -m "feat(pagos): PaymentStatusMenu (menú de 3 estados) sobre Base UI Menu"
```

---

### Task 4: Cablear `Admin.tsx` (menú por participante + desglose)

**Files:**
- Modify: `src/routes/Admin.tsx`

No hay test unitario de rutas en el proyecto (Admin.tsx no se testea hoy); se valida con `npm run build` + E2E manual.

- [ ] **Step 1: Imports y mutación** — en `src/routes/Admin.tsx`:
  - Añadir import: `import { PaymentStatusMenu } from "@/components/PaymentStatusMenu";`
  - Cambiar `const setPaid = useMutation(api.participants.setParticipantPaid);` por
    `const setPayment = useMutation(api.participants.setParticipantPayment);`
  - Renombrar el estado `togglingPaidId`/`setTogglingPaidId` → `savingPaymentId`/`setSavingPaymentId`.

- [ ] **Step 2: Handler** — reemplazar `onTogglePaid` por:

```tsx
  async function onSelectPayment(
    participantId: string,
    method: "pending" | "efectivo" | "transferencia",
  ) {
    setSavingPaymentId(participantId);
    try {
      await setPayment({
        adminToken: token!,
        participantId: participantId as Id<"participants">,
        method,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el pago");
    } finally {
      setSavingPaymentId(null);
    }
  }
```

- [ ] **Step 3: Desglose en la tarjeta del bote** — junto a `const pendingPesos = ...` añadir:

```tsx
  const entryFee = quiniela.prize.entryFee ?? 0;
  const efectivoPesos = quiniela.methodCounts.efectivo * entryFee;
  const transferenciaPesos = quiniela.methodCounts.transferencia * entryFee;
  const sinClasificar = paidCount - quiniela.methodCounts.efectivo - quiniela.methodCounts.transferencia;
```

Dentro de la tarjeta `perPerson`, tras el `<div>` de `{paidCount}/{quiniela.filledCount} pagados …`, añadir:

```tsx
          {paidCount > 0 && (
            <div className="mt-0.5 text-[0.7rem] text-muted-foreground">
              Efectivo: {formatMXN(efectivoPesos)} · Transferencia: {formatMXN(transferenciaPesos)}
              {sinClasificar > 0 && ` · Sin clasificar: ${formatMXN(sinClasificar * entryFee)}`}
            </div>
          )}
```

- [ ] **Step 4: Reemplazar el toggle por el menú** — sustituir el `<button>` de Pagó/Pendiente (bloque `{perPerson && (<button …>)}`) por:

```tsx
              {perPerson && (
                <PaymentStatusMenu
                  paid={p.paid}
                  method={p.paymentMethod}
                  disabled={savingPaymentId === p.id}
                  onSelect={(method) => void onSelectPayment(p.id, method)}
                />
              )}
```

- [ ] **Step 5: Verificar build + tests**

Run: `npm run build && npx vitest run`
Expected: build OK, todos los tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Admin.tsx
git commit -m "feat(pagos): menú de método y desglose por método en el panel admin"
```

---

### Task 5: Limpieza — quitar `setParticipantPaid`

**Files:**
- Modify: `convex/participants.ts` (remover `setParticipantPaid`)
- Modify: `convex/participants.test.ts` (remover `describe("setParticipantPaid")`)
- Modify: `convex/quinielas.test.ts` (migrar 2 call-sites)

- [ ] **Step 1: Migrar call-sites de test** — en `convex/quinielas.test.ts`, cambiar las 2 líneas que usan `setParticipantPaid(..., paid: true)` por `setParticipantPayment(..., method: "efectivo")`. En `convex/participants.test.ts`, en el test del bote per_person (el que confirma el pago de Ana), cambiar `setParticipantPaid(..., paid: true)` por `setParticipantPayment(..., method: "efectivo")`.

- [ ] **Step 2: Remover el bloque viejo** — borrar `describe("setParticipantPaid", () => { … })` completo de `convex/participants.test.ts`.

- [ ] **Step 3: Remover la mutación** — borrar `export const setParticipantPaid = mutation({ … })` de `convex/participants.ts`.

- [ ] **Step 4: Verificar todo**

Run: `npm run build && npx vitest run && npm run lint`
Expected: build OK, tests PASS, lint sin errores en archivos propios.

- [ ] **Step 5: Commit**

```bash
git add convex/participants.ts convex/participants.test.ts convex/quinielas.test.ts
git commit -m "refactor(pagos): retirar setParticipantPaid (reemplazada por setParticipantPayment)"
```

---

### Task 6: Verificación final + E2E manual

- [ ] **Step 1: Suite completa**

Run: `npx vitest run && npm run build && npm run lint`
Expected: todo verde.

- [ ] **Step 2: E2E manual (Playwright MCP)** — `npm run dev`, crear una quiniela `per_person` (cuota $200), inscribir 3 jugadores, abrir el panel admin:
  - Marcar uno **Efectivo**, otro **Transferencia**, dejar uno **Pendiente**.
  - Verificar: el botón de cada uno muestra el estado; la tarjeta del bote muestra `Efectivo: $200 · Transferencia: $200`; el bote total = `$400` (igual que si fueran solo "Pagó").
  - Cambiar uno de Efectivo a Pendiente → el bote baja y el desglose se ajusta.
