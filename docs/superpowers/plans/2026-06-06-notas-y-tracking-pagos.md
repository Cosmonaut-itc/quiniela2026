# Notas generales + tracking de pagos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir notas generales editables por el admin (visibles en el área general) y un tracking de pagos por participante en modo `per_person`, de modo que el bote mostrado a todos refleje solo los pagos confirmados.

**Architecture:** Cambios aditivos al schema de Convex (`quinielas.notes`, `participants.paid`). El bote reusa `PrizeView.contributors` pasándole `paidCount` en vez de `filledCount`. Dos mutaciones nuevas (`updateNotes`, `setParticipantPaid`) autorizadas por `adminToken`. Frontend: nuevo `ui/textarea`, tarjeta de notas en el área general, editor de notas y toggles de pago en el panel admin.

**Tech Stack:** Convex (queries/mutations + `convex-test` con edge-runtime), React + TypeScript, Vite, Tailwind, base-ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-notas-y-tracking-pagos-design.md`

---

## File structure

**Backend (Convex)**
- `convex/schema.ts` — `quinielas.notes` (Task 1), `participants.paid` (Task 3)
- `convex/types.ts` — `OverviewData`/`AdminData` notes (Task 1); `AdminData.participants` id+paid y comentario de `contributors` (Task 3)
- `convex/quinielas.ts` — `createQuiniela` notes, `updateNotes` nueva, `getOverview`/`getAdmin` notes (Task 1); `getOverview` paidCount, `getAdmin` id+paid (Task 3)
- `convex/participants.ts` — `getPersonalPanel` paidCount, `setParticipantPaid` nueva (Task 3)
- `convex/quinielas.test.ts` — tests de notas (Task 1) y de bote por pagados (Task 3)
- `convex/participants.test.ts` — tests de `setParticipantPaid` (Task 3)

**Frontend**
- `src/components/ui/textarea.tsx` — componente nuevo (Task 2)
- `src/routes/Home.tsx` — campo de notas (Task 2); copy del modo per_person (Task 4)
- `src/routes/Join.tsx` — tarjeta de notas (Task 2)
- `src/routes/Admin.tsx` — editor de notas (Task 2); resumen + toggles de pago (Task 4)
- `src/lib/format.ts` — subline "pagados" (Task 4)
- `src/lib/format.test.ts` — tests de wording (Task 4)

---

## Task 1: Notas — backend

**Files:**
- Modify: `convex/schema.ts:38-56` (tabla `quinielas`)
- Modify: `convex/types.ts` (`OverviewData`, `AdminData`)
- Modify: `convex/quinielas.ts` (`createQuiniela`, `getOverview`, `getAdmin`, nueva `updateNotes`)
- Test: `convex/quinielas.test.ts`

- [ ] **Step 1: Add the `notes` field to the schema**

En `convex/schema.ts`, dentro de `quinielas: defineTable({ ... })`, justo después de la línea `entryFee: v.optional(v.number()), ...`, añade:

```ts
    notes: v.optional(v.string()), // texto libre del admin; ausente/"" = sin notas
```

- [ ] **Step 2: Extend the read-model types with `notes`**

En `convex/types.ts`, en `OverviewData.quiniela`, añade `notes` (queda así el objeto):

```ts
export type OverviewData = {
  quiniela: { name: string; photoUrl: string | null; prize: PrizeView;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished";
              assignMode: AssignMode; notes: string | null };
```

Y en `AdminData.quiniela`:

```ts
export type AdminData = {
  quiniela: { name: string; photoUrl: string | null; prize: PrizeView;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished";
              joinToken: string; assignMode: AssignMode; notes: string | null };
```

- [ ] **Step 3: Write the failing tests for notes**

En `convex/quinielas.test.ts`, añade al final del archivo un nuevo bloque:

```ts
describe("notes", () => {
  it("stores trimmed notes on create and omits empty notes", async () => {
    const t = await seeded();
    const withNotes = await t.mutation(api.quinielas.createQuiniela, {
      name: "Con notas", prizeText: "$1", numParticipants: 4, notes: "  Pagar antes del viernes  ",
    });
    const blank = await t.mutation(api.quinielas.createQuiniela, {
      name: "Sin notas", prizeText: "$1", numParticipants: 4, notes: "   ",
    });
    const a = await t.run((ctx) => ctx.db.get(withNotes.quinielaId));
    const b = await t.run((ctx) => ctx.db.get(blank.quinielaId));
    expect(a!.notes).toBe("Pagar antes del viernes");
    expect(b!.notes).toBeUndefined();
  });

  it("updateNotes edits and clears, and rejects a bad adminToken", async () => {
    const t = await seeded();
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4 });
    await t.mutation(api.quinielas.updateNotes, { adminToken: q.adminToken, notes: "  Sede: casa de Ana  " });
    let qn = await t.run((ctx) => ctx.db.get(q.quinielaId));
    expect(qn!.notes).toBe("Sede: casa de Ana");
    await t.mutation(api.quinielas.updateNotes, { adminToken: q.adminToken, notes: "" });
    qn = await t.run((ctx) => ctx.db.get(q.quinielaId));
    expect(qn!.notes).toBeUndefined();
    await expect(
      t.mutation(api.quinielas.updateNotes, { adminToken: "no-existe", notes: "x" }),
    ).rejects.toThrow();
  });

  it("exposes notes in getOverview and getAdmin", async () => {
    const t = await seeded();
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "F", prizeText: "$1", numParticipants: 4, notes: "Reglas aquí",
    });
    const ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    const admin = await t.query(api.quinielas.getAdmin, { adminToken: q.adminToken });
    expect(ov.quiniela.notes).toBe("Reglas aquí");
    expect(admin.quiniela.notes).toBe("Reglas aquí");
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run convex/quinielas.test.ts -t notes`
Expected: FAIL (tipo `notes` no aceptado por `createQuiniela`, `updateNotes` no existe, `notes` ausente en los retornos).

- [ ] **Step 5: Implement `notes` in `createQuiniela`**

En `convex/quinielas.ts`, en `createQuiniela`, añade el arg y guárdalo. En `args` añade:

```ts
    notes: v.optional(v.string()),
```

Dentro del `handler`, antes del `ctx.db.insert("quinielas", {...})`, calcula:

```ts
    const notes = (args.notes ?? "").trim().slice(0, 1000);
```

Y en el objeto del `insert`, añade (después de `photoId: args.photoId,`):

```ts
      notes: notes || undefined,
```

- [ ] **Step 6: Implement the `updateNotes` mutation**

En `convex/quinielas.ts`, añade esta mutación (p. ej. después de `createQuiniela`):

```ts
export const updateNotes = mutation({
  args: { adminToken: v.string(), notes: v.string() },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const notes = args.notes.trim().slice(0, 1000);
    await ctx.db.patch(qn._id, { notes: notes || undefined });
    return { ok: true as const };
  },
});
```

- [ ] **Step 7: Return `notes` from `getOverview` and `getAdmin`**

En `convex/quinielas.ts`, en el `return` de `getOverview`, dentro del objeto `quiniela`, añade (junto a `assignMode: modeOf(qn),`):

```ts
        notes: qn.notes ?? null,
```

En el `return` de `getAdmin`, dentro del objeto `quiniela`, añade (junto a `joinToken: qn.joinToken, assignMode: modeOf(qn),`):

```ts
        notes: qn.notes ?? null,
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run convex/quinielas.test.ts`
Expected: PASS (todos, incluido el bloque `notes`).

- [ ] **Step 9: Commit**

```bash
git add convex/schema.ts convex/types.ts convex/quinielas.ts convex/quinielas.test.ts
git commit -m "feat: notas generales por quiniela (backend + updateNotes)"
```

---

## Task 2: Notas — frontend

**Files:**
- Create: `src/components/ui/textarea.tsx`
- Modify: `src/routes/Home.tsx`
- Modify: `src/routes/Join.tsx`
- Modify: `src/routes/Admin.tsx`

- [ ] **Step 1: Create the `Textarea` component**

Crea `src/components/ui/textarea.tsx` con:

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
```

- [ ] **Step 2: Add a notes field to the creation form**

En `src/routes/Home.tsx`:

1. Importa el componente (junto a los otros imports de `@/components/ui/...`):

```tsx
import { Textarea } from "@/components/ui/textarea";
```

2. Añade estado (junto a `const [file, setFile] = useState<File | null>(null);`):

```tsx
  const [notes, setNotes] = useState("");
```

3. En `submit()`, dentro del objeto que se pasa a `create({ ... })`, añade (después de `entryFee: ...,`):

```tsx
        notes,
```

4. En el formulario, justo antes del bloque `<div className="flex flex-col gap-2">` que contiene el campo `Foto (opcional)`, añade:

```tsx
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reglas, fecha límite de pago, sede…"
              maxLength={1000}
              rows={3}
            />
          </div>
```

- [ ] **Step 3: Show notes in the general area (Join)**

En `src/routes/Join.tsx`, justo después del `</header>` (cierre del header con el banner de premio) y antes del bloque de `{/* Players table */}`, añade:

```tsx
      {quiniela.notes && (
        <>
          <SectionHeading>Notas</SectionHeading>
          <div className="grain relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-3 text-sm whitespace-pre-wrap text-foreground/90">
            {quiniela.notes}
          </div>
        </>
      )}
```

(`SectionHeading` ya está importado en `Join.tsx`.)

- [ ] **Step 4: Add an editable notes section in the admin panel**

En `src/routes/Admin.tsx`:

1. Importa el componente y un hook de estado/efecto. Añade a los imports de UI:

```tsx
import { Textarea } from "@/components/ui/textarea";
```

`useState` ya está importado. Añade también `useEffect` al import de React:

```tsx
import { useState, useEffect } from "react";
```

2. Añade la mutación (junto a `const close = useMutation(...)`):

```tsx
  const saveNotes = useMutation(api.quinielas.updateNotes);
```

3. Añade estado para el editor (junto a los otros `useState` del componente):

```tsx
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
```

4. Sincroniza el borrador cuando llegan los datos. Después de `if (data === undefined) return <LoadingState />;` no se puede usar hooks; en su lugar coloca este `useEffect` **antes** de ese `return` (los hooks van antes de cualquier return condicional):

```tsx
  useEffect(() => {
    if (data?.quiniela.notes != null) setNotesDraft(data.quiniela.notes);
  }, [data?.quiniela.notes]);
```

5. Añade el handler (junto a las otras funciones `async`):

```tsx
  async function onSaveNotes() {
    setSavingNotes(true);
    try {
      await saveNotes({ adminToken: token!, notes: notesDraft });
      toast.success("Notas guardadas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron guardar las notas");
    } finally {
      setSavingNotes(false);
    }
  }
```

6. Renderiza la sección. Justo después del bloque del link de invitación (`{/* Invite link card */}` … su `</div>` de cierre) y antes de `{/* Close & redistribute */}`, añade:

```tsx
      {/* Notes editor */}
      <SectionHeading>Notas</SectionHeading>
      <div className="grain relative overflow-hidden rounded-2xl border border-border bg-card p-4">
        <Textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          placeholder="Reglas, fecha límite de pago, sede… (visible para todos)"
          maxLength={1000}
          rows={3}
        />
        <Button
          size="sm"
          className="mt-2.5 rounded-lg"
          disabled={savingNotes || notesDraft === (data.quiniela.notes ?? "")}
          onClick={() => void onSaveNotes()}
        >
          {savingNotes ? "Guardando…" : "Guardar notas"}
        </Button>
      </div>
```

(`SectionHeading` ya está importado en `Admin.tsx`.)

- [ ] **Step 5: Verify the build and lint pass**

Run: `npm run build && npm run lint`
Expected: ambos limpios (sin errores de tipos ni de lint).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/textarea.tsx src/routes/Home.tsx src/routes/Join.tsx src/routes/Admin.tsx
git commit -m "feat: campo de notas en creación, área general y editor en admin"
```

---

## Task 3: Tracking de pagos — backend

**Files:**
- Modify: `convex/schema.ts` (tabla `participants`)
- Modify: `convex/types.ts` (`AdminData.participants`, comentario de `PrizeView.contributors`)
- Modify: `convex/quinielas.ts` (`getOverview` paidCount, `getAdmin` id+paid)
- Modify: `convex/participants.ts` (`getPersonalPanel` paidCount, nueva `setParticipantPaid`)
- Test: `convex/quinielas.test.ts`, `convex/participants.test.ts`

- [ ] **Step 1: Add the `paid` field to the schema**

En `convex/schema.ts`, dentro de `participants: defineTable({ ... })`, después de `joinedAt: v.number(),`, añade:

```ts
    paid: v.optional(v.boolean()), // solo relevante en per_person; ausente = no pagó
```

- [ ] **Step 2: Extend `AdminData.participants` and update the contributors comment**

En `convex/types.ts`, cambia la línea de `participants` en `AdminData`:

```ts
  participants: { id: string; name: string; personalToken: string; teamCount: number; paid: boolean }[];
```

Y actualiza el comentario del campo `contributors` en `PrizeView`:

```ts
  contributors: number;    // per_person: cuántos han PAGADO (definen el bote). fixed: irrelevante.
```

- [ ] **Step 3: Write the failing tests — overview pool from paid only**

En `convex/quinielas.test.ts`, **reemplaza** el primer test del bloque `describe("getOverview prize", ...)` (el que se llama `"computes a per_person pool that grows as people join"`) por este:

```ts
  it("computes a per_person pool from PAID participants, not just joiners", async () => {
    const t = await seeded();
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "Rifa", prizeText: "", numParticipants: 20, prizeMode: "per_person", entryFee: 200,
    });
    for (const name of ["A", "B", "C"]) {
      await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name });
    }
    // nadie marcado como pagado → bote 0, pero 3 inscritos
    let ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    expect(ov.quiniela.filledCount).toBe(3);
    expect(ov.quiniela.prize.pool).toBe(0);
    expect(ov.quiniela.prize.contributors).toBe(0);
    // el admin confirma dos pagos → bote 400
    const ps = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    await t.mutation(api.participants.setParticipantPaid, { adminToken: q.adminToken, participantId: ps[0]._id, paid: true });
    await t.mutation(api.participants.setParticipantPaid, { adminToken: q.adminToken, participantId: ps[1]._id, paid: true });
    ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    expect(ov.quiniela.prize.pool).toBe(400);
    expect(ov.quiniela.prize.contributors).toBe(2);
  });
```

- [ ] **Step 4: Write the failing tests — getAdmin exposes id+paid**

En `convex/quinielas.test.ts`, dentro del bloque `describe("getAdmin", ...)`, añade:

```ts
  it("exposes participant id and paid flag (default false)", async () => {
    const t = await seeded();
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const admin = await t.query(api.quinielas.getAdmin, { adminToken: q.adminToken });
    expect(admin.participants[0].id).toBeDefined();
    expect(admin.participants[0].paid).toBe(false);
  });
```

- [ ] **Step 5: Write the failing tests — setParticipantPaid mutation**

En `convex/participants.test.ts`, añade al final un bloque nuevo:

```ts
describe("setParticipantPaid", () => {
  it("marks and unmarks a participant as paid", async () => {
    const { t, q } = await setup(4);
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const ps = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    await t.mutation(api.participants.setParticipantPaid, { adminToken: q.adminToken, participantId: ps[0]._id, paid: true });
    let admin = await t.query(api.quinielas.getAdmin, { adminToken: q.adminToken });
    expect(admin.participants[0].paid).toBe(true);
    await t.mutation(api.participants.setParticipantPaid, { adminToken: q.adminToken, participantId: ps[0]._id, paid: false });
    admin = await t.query(api.quinielas.getAdmin, { adminToken: q.adminToken });
    expect(admin.participants[0].paid).toBe(false);
  });

  it("rejects a foreign adminToken", async () => {
    const { t, q } = await setup(4);
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const ps = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    await expect(
      t.mutation(api.participants.setParticipantPaid, { adminToken: "ajeno", participantId: ps[0]._id, paid: true }),
    ).rejects.toThrow();
  });

  it("still works after the quiniela is locked (late payments)", async () => {
    const { t, q } = await setup(4);
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    const ps = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    await t.mutation(api.participants.setParticipantPaid, { adminToken: q.adminToken, participantId: ps[0]._id, paid: true });
    const admin = await t.query(api.quinielas.getAdmin, { adminToken: q.adminToken });
    expect(admin.participants[0].paid).toBe(true);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run convex/quinielas.test.ts convex/participants.test.ts`
Expected: FAIL (`setParticipantPaid` no existe; `prize.pool` aún usa inscritos; `id`/`paid` ausentes en `getAdmin`).

- [ ] **Step 7: Implement `setParticipantPaid`**

En `convex/participants.ts`, añade la mutación (después de `joinQuiniela`):

```ts
export const setParticipantPaid = mutation({
  args: { adminToken: v.string(), participantId: v.id("participants"), paid: v.boolean() },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.participantId);
    if (!p) throw new Error("Participante no encontrado");
    const qn = await ctx.db.get(p.quinielaId);
    if (!qn || qn.adminToken !== args.adminToken) throw new Error("No autorizado");
    await ctx.db.patch(args.participantId, { paid: args.paid });
    return { ok: true as const };
  },
});
```

- [ ] **Step 8: Compute the pool from paid participants**

En `convex/participants.ts`, en `getPersonalPanel`, antes del `return`, añade:

```ts
    const paidCount = participants.filter((p) => p.paid === true).length;
```

y cambia `prize: prizeView(qn, participants.length),` por:

```ts
      prize: prizeView(qn, paidCount),
```

En `convex/quinielas.ts`, en `getOverview`, antes del `return`, añade:

```ts
    const paidCount = participants.filter((p) => p.paid === true).length;
```

y cambia `prize: prizeView(qn, participants.length),` por:

```ts
        prize: prizeView(qn, paidCount),
```

- [ ] **Step 9: Expose id+paid in getAdmin**

En `convex/quinielas.ts`, en `getAdmin`, cambia el `.map` de `participants` por:

```ts
      participants: participants.map((p) => ({
        id: p._id as string, name: p.name, personalToken: p.personalToken,
        teamCount: ownerships.filter((o) => o.participantId === p._id).length,
        paid: p.paid === true,
      })),
```

(`getAdmin` también devuelve `prize: prizeView(qn, participants.length)`. Para que el admin vea el bote confirmado, cámbialo a `prizeView(qn, paidCount)`: añade `const paidCount = participants.filter((p) => p.paid === true).length;` antes del `return` de `getAdmin` y usa `prize: prizeView(qn, paidCount),`.)

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run convex/quinielas.test.ts convex/participants.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add convex/schema.ts convex/types.ts convex/quinielas.ts convex/participants.ts convex/quinielas.test.ts convex/participants.test.ts
git commit -m "feat: tracking de pagos por participante; bote = cuota × pagados"
```

---

## Task 4: Tracking de pagos — frontend

**Files:**
- Modify: `src/lib/format.ts` (`prizeBanner`)
- Modify: `src/lib/format.test.ts`
- Modify: `src/routes/Home.tsx` (copy del modo per_person)
- Modify: `src/routes/Admin.tsx` (resumen + toggles de pago)

- [ ] **Step 1: Update the banner unit tests to "pagados"**

En `src/lib/format.test.ts`, reemplaza los dos tests del modo abierto por:

```ts
  it("per_person open: live growing pot", () => {
    expect(prizeBanner(perPerson(200, 7), "open", " al campeón"))
      .toEqual({ title: "Bote: $1,400", subline: "$200 × 7 pagados" });
  });
  it("per_person open singular", () => {
    expect(prizeBanner(perPerson(200, 1), "open", " al campeón").subline)
      .toBe("$200 × 1 pagado");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL (el subline aún dice "inscritos").

- [ ] **Step 3: Update `prizeBanner` wording**

En `src/lib/format.ts`, en `prizeBanner`, dentro de la rama `if (status === "open")`, cambia el subline:

```ts
    if (status === "open") {
      return { title: `Bote: ${pool}`, subline: `${fee} × ${n} ${n === 1 ? "pagado" : "pagados"}` };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the creation-form copy for the new model**

En `src/routes/Home.tsx`:

1. En el arreglo de opciones del toggle de premio, cambia el `sub` de la opción `per_person`:

```tsx
                  {
                    v: "per_person",
                    title: "Por participación 💰",
                    sub: "Cuota por persona; el bote se arma con quienes confirmen su pago.",
                  },
```

2. En el helper bajo "Máximo de participantes", cambia el texto del caso `per_person`:

```tsx
              {prizeMode === "per_person"
                ? "Tope de gente; el bote refleja a quienes ya pagaron (tú confirmas cada pago). Los 48 equipos se reparten entre ustedes."
                : "Entre 2 y 48 · los 48 equipos se reparten entre ustedes."}
```

- [ ] **Step 6: Add the payment summary and per-participant toggle in admin**

En `src/routes/Admin.tsx`:

1. Añade la mutación (junto a `const saveNotes = useMutation(...)`):

```tsx
  const setPaid = useMutation(api.participants.setParticipantPaid);
```

2. Añade un handler (junto a las otras funciones `async`):

```tsx
  async function onTogglePaid(participantId: string, paid: boolean) {
    try {
      await setPaid({ adminToken: token!, participantId: participantId as Id<"participants">, paid });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el pago");
    }
  }
```

Para el tipo `Id`, añade el import al inicio del archivo:

```tsx
import type { Id } from "@/../convex/_generated/dataModel";
```

3. Calcula los valores del resumen. Después de `const { quiniela } = data;`, añade:

```tsx
  const perPerson = quiniela.prize.mode === "per_person";
  const paidCount = quiniela.prize.contributors;
  const pendingCount = quiniela.filledCount - paidCount;
  const pendingPesos = pendingCount * (quiniela.prize.entryFee ?? 0);
```

4. Justo después del `<SectionHeading>Participantes …</SectionHeading>` (y antes del `<div className="space-y-2.5">` de la lista), añade el resumen condicional:

```tsx
      {perPerson && (
        <div className="mb-2.5 rounded-2xl border border-gold/30 bg-card px-4 py-3 text-sm">
          <div className="font-semibold text-gold">
            Bote confirmado: {formatMXN(quiniela.prize.pool ?? 0)}
          </div>
          <div className="mt-0.5 text-[0.7rem] text-muted-foreground">
            {paidCount}/{quiniela.filledCount} pagados
            {pendingCount > 0 && ` · ${formatMXN(pendingPesos)} pendientes`}
          </div>
        </div>
      )}
```

Para `formatMXN`, añade el import:

```tsx
import { formatMXN } from "@/lib/format";
```

5. Dentro del `.map` de participantes (`data.participants.map((p) => ( ... ))`), añade el toggle de pago. En el `<div>` de cada participante, **después** del bloque `<div className="min-w-0"> … </div>` (nombre + conteo de equipos) y **antes** del `<Button … Copiar link>`, inserta:

```tsx
              {perPerson && (
                <button
                  type="button"
                  onClick={() => void onTogglePaid(p.id, !p.paid)}
                  aria-pressed={p.paid}
                  className={
                    "shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors " +
                    (p.paid
                      ? "bg-alive/15 text-alive"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground")
                  }
                >
                  {p.paid ? "✓ Pagó" : "Pendiente"}
                </button>
              )}
```

(El contenedor de cada participante usa `flex items-center justify-between gap-2`; el botón nuevo se acomoda entre el nombre y el botón de copiar.)

- [ ] **Step 7: Verify all tests, build, and lint pass**

Run: `npm test && npm run build && npm run lint`
Expected: tests verdes, build limpio, lint limpio.

- [ ] **Step 8: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts src/routes/Home.tsx src/routes/Admin.tsx
git commit -m "feat: UI de pagos en admin (resumen + toggle) y copy del bote por pagados"
```

---

## Task 5: Validación E2E y cierre

**Files:** ninguno (validación manual con Playwright contra dev).

- [ ] **Step 1: Levantar el stack local de dev**

Run (en terminales separadas, según el flujo del repo):
- `npx convex dev --once` (empuja schema/funciones a dev)
- `npm run dev` (Vite en :5173)

- [ ] **Step 2: E2E — Notas**

Con Playwright:
1. Crear una quiniela con notas (p. ej. "Pagar antes del viernes").
2. Abrir el área general (link de invitación) → la tarjeta "Notas" muestra el texto.
3. En el panel admin, editar las notas y guardar → recargar el área general → refleja el cambio.
4. Vaciar las notas en admin y guardar → la tarjeta desaparece del área general.

- [ ] **Step 3: E2E — Pagos (per_person)**

1. Crear una quiniela `Por participación 💰` con cuota $200.
2. Inscribir 3 participantes → el banner del área general muestra `Bote: $0` / `$200 × 0 pagados` (nadie ha pagado).
3. En admin, marcar 2 como "Pagó" → el resumen muestra `Bote confirmado: $400 · 2/3 pagados · $200 pendientes`.
4. Recargar el área general y un panel personal → el banner muestra `Bote: $400` / `$200 × 2 pagados`.
5. Confirmar que en el área general y el panel personal **no** aparece quién pagó (solo el número del bote).

- [ ] **Step 4: E2E — Regresión modo fijo**

1. Crear una quiniela de premio fijo ("$5,000") → banner `$5,000 al campeón`, sin subline.
2. En admin: no aparece el resumen de bote ni el toggle "Pagó/Pendiente"; sí aparece el editor de notas.

- [ ] **Step 5: Despliegue (cuando el usuario lo autorice)**

Orden obligatorio **backend antes que frontend**:
- `npx convex deploy --yes`
- `railway up --service quiniela2026`

(No desplegar sin confirmación explícita del usuario.)

---

## Notes for the implementer

- **Tipos de Convex:** cambiar args/returns de funciones existentes se refleja en `tsc` sin correr codegen. `setParticipantPaid` y `updateNotes` son funciones nuevas dentro de archivos existentes (`participants.ts`, `quinielas.ts`), así que `api.participants.setParticipantPaid` / `api.quinielas.updateNotes` quedan disponibles tras `npx convex dev`/codegen, pero en los tests `convex-test` los descubre vía `import.meta.glob`. Si `tsc`/editor no ve las nuevas funciones en `api`, corre `npx convex dev --once` para regenerar `_generated`.
- **Hooks antes de returns:** en `Admin.tsx`, el `useEffect` de sincronización de notas debe ir **antes** de `if (data === undefined) return <LoadingState />;` para no violar las reglas de hooks.
- **`db.patch` con `undefined`** elimina el campo (así se limpian las notas).
- **Default de pago:** `paid` ausente = no pagó. Las quinielas `per_person` existentes mostrarán bote $0 hasta que el admin confirme pagos — comportamiento esperado.
```
