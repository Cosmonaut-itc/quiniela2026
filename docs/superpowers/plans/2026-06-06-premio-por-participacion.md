# Premio por participación (bote dinámico) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un segundo modo de premio `per_person` (cuota por persona) con bote en vivo que crece con cada inscrito, junto al premio fijo actual.

**Architecture:** Campos opcionales `prizeMode`/`entryFee` en `quinielas` (patrón legacy = `fixed`, igual que `assignMode`). El bote se calcula en el servidor (`pool = entryFee × filledCount`) vía un helper puro y se devuelve como objeto `prize` en las tres queries de lectura. El front formatea con `formatMXN` y arma el banner con un helper puro. Estrategia sin build roto: se **añade** `prize` manteniendo `prizeText`, se migra el front, y al final se **quita** `prizeText`.

**Tech Stack:** Convex (queries/mutations + convex-test), React 19 + Vite, TypeScript, Tailwind v4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-06-premio-por-participacion-design.md`

**Idioma:** Español (UI, docs y commits). Commits atómicos.

---

## Resumen de archivos

- **Crear:** `convex/lib/view.test.ts` — tests de los helpers puros `prizeModeOf` / `prizeView`.
- **Crear:** `src/lib/format.test.ts` — tests de `formatMXN` / `prizeBanner`.
- **Modificar:** `convex/schema.ts` — campos `prizeMode`, `entryFee`.
- **Modificar:** `convex/types.ts` — tipos `PrizeMode`, `PrizeView`; `prize` en los tres tipos de retorno; `status` en `PersonalData`.
- **Modificar:** `convex/lib/view.ts` — helpers `prizeModeOf`, `prizeView`.
- **Modificar:** `convex/quinielas.ts` — `createQuiniela` acepta `prizeMode`/`entryFee`; las queries devuelven `prize`.
- **Modificar:** `convex/participants.ts` — `getPersonalPanel` devuelve `prize` + `status`.
- **Modificar:** `convex/quinielas.test.ts` — tests de `createQuiniela` y `getOverview`.
- **Modificar:** `src/lib/format.ts` — helpers `formatMXN`, `prizeBanner`.
- **Modificar:** `src/components/bits.tsx` — `PrizeBanner` pasa a `{ title, subline }`.
- **Modificar:** `src/routes/Join.tsx`, `src/routes/Personal.tsx` — usar `prize` + `prizeBanner`.
- **Modificar:** `src/routes/Home.tsx` — toggle de modo + campo de cuota.

Comandos clave:
- Tests: `npm test` (vitest run). Un archivo: `npx vitest run convex/lib/view.test.ts`.
- Build/typecheck: `npm run build` (`tsc -b && vite build`).
- Lint: `npm run lint`.

---

## Task 1: Schema — campos `prizeMode` y `entryFee` (aditivo)

**Files:**
- Modify: `convex/schema.ts:38-55` (tabla `quinielas`)

- [ ] **Step 1: Añadir los dos campos opcionales a la tabla `quinielas`**

En `convex/schema.ts`, dentro de `quinielas: defineTable({ ... })`, justo después de la línea `prizeText: v.string(),` añade:

```ts
    prizeText: v.string(),
    prizeMode: v.optional(v.string()), // "fixed" | "per_person"; ausente = "fixed" (legacy)
    entryFee: v.optional(v.number()),  // solo per_person; entero >= 1 (pesos)
```

- [ ] **Step 2: Verificar que nada se rompe**

Run: `npm test`
Expected: PASS (los campos son opcionales; las filas y tests existentes siguen válidos).

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: campos prizeMode y entryFee en quinielas (aditivo)"
```

---

## Task 2: Tipos + helpers puros `prizeModeOf` / `prizeView`

**Files:**
- Modify: `convex/types.ts` (añadir `PrizeMode`, `PrizeView`)
- Modify: `convex/lib/view.ts` (añadir helpers)
- Test: `convex/lib/view.test.ts` (nuevo)

- [ ] **Step 1: Escribir el test que falla**

Crea `convex/lib/view.test.ts`:

```ts
// convex/lib/view.test.ts
import { describe, it, expect } from "vitest";
import { prizeModeOf, prizeView } from "./view";

describe("prizeModeOf", () => {
  it("treats a missing mode as fixed (legacy)", () => {
    expect(prizeModeOf({})).toBe("fixed");
    expect(prizeModeOf({ prizeMode: "fixed" })).toBe("fixed");
    expect(prizeModeOf({ prizeMode: "weird" })).toBe("fixed");
  });
  it("recognises per_person", () => {
    expect(prizeModeOf({ prizeMode: "per_person" })).toBe("per_person");
  });
});

describe("prizeView", () => {
  it("returns the fixed text and a null pool for fixed mode", () => {
    const p = prizeView({ prizeText: "$5,000" }, 3);
    expect(p).toEqual({
      mode: "fixed", text: "$5,000", entryFee: null, pool: null, contributors: 3,
    });
  });
  it("computes pool = entryFee * contributors for per_person", () => {
    const p = prizeView({ prizeText: "", prizeMode: "per_person", entryFee: 200 }, 7);
    expect(p).toEqual({
      mode: "per_person", text: "", entryFee: 200, pool: 1400, contributors: 7,
    });
  });
  it("per_person with zero contributors yields a zero pool", () => {
    const p = prizeView({ prizeText: "", prizeMode: "per_person", entryFee: 200 }, 0);
    expect(p.pool).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run convex/lib/view.test.ts`
Expected: FAIL — `prizeModeOf`/`prizeView` no exportados desde `./view`.

- [ ] **Step 3: Añadir los tipos en `convex/types.ts`**

Al inicio de `convex/types.ts`, debajo de la línea `export type AssignMode = ...`, añade:

```ts
// Cómo se define el premio:
//   fixed      → texto libre (prizeText), como hasta ahora (default / legacy)
//   per_person → cuota por persona (entryFee); el bote crece con los inscritos
export type PrizeMode = "fixed" | "per_person";

export type PrizeView = {
  mode: PrizeMode;
  text: string;            // fixed: prizeText. per_person: "".
  entryFee: number | null; // per_person: la cuota. fixed: null.
  pool: number | null;     // per_person: entryFee * contributors. fixed: null.
  contributors: number;    // filledCount (relevante en per_person).
};
```

- [ ] **Step 4: Implementar los helpers en `convex/lib/view.ts`**

En `convex/lib/view.ts`, añade el import del tipo y los dos helpers al final del archivo:

```ts
import type { PrizeMode, PrizeView } from "../types";

export function prizeModeOf(qn: { prizeMode?: string }): PrizeMode {
  return qn.prizeMode === "per_person" ? "per_person" : "fixed";
}

export function prizeView(
  qn: { prizeMode?: string; prizeText: string; entryFee?: number },
  contributors: number,
): PrizeView {
  if (prizeModeOf(qn) === "per_person") {
    const entryFee = qn.entryFee ?? 0;
    return { mode: "per_person", text: "", entryFee, pool: entryFee * contributors, contributors };
  }
  return { mode: "fixed", text: qn.prizeText, entryFee: null, pool: null, contributors };
}
```

Nota: el import `type { Id }` y `type { TeamLite }` ya existen arriba; solo añade la línea de import de `PrizeMode, PrizeView` junto a los imports de tipos.

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run convex/lib/view.test.ts`
Expected: PASS (todas).

- [ ] **Step 6: Commit**

```bash
git add convex/types.ts convex/lib/view.ts convex/lib/view.test.ts
git commit -m "feat: tipos PrizeView y helpers prizeModeOf/prizeView"
```

---

## Task 3: `createQuiniela` acepta y valida `prizeMode` + `entryFee`

**Files:**
- Modify: `convex/quinielas.ts:47-74` (`createQuiniela`)
- Test: `convex/quinielas.test.ts` (añadir al `describe("createQuiniela")`)

- [ ] **Step 1: Escribir el test que falla**

En `convex/quinielas.test.ts`, dentro de `describe("createQuiniela", ...)`, añade dos casos nuevos antes del cierre del `describe`:

```ts
  it("stores per_person mode with a validated entry fee and empty prizeText", async () => {
    const t = await seeded();
    const res = await t.mutation(api.quinielas.createQuiniela, {
      name: "Rifa", prizeText: "ignorado", numParticipants: 20,
      prizeMode: "per_person", entryFee: 200,
    });
    const qn = await t.run((ctx) => ctx.db.get(res.quinielaId));
    expect(qn!.prizeMode).toBe("per_person");
    expect(qn!.entryFee).toBe(200);
    expect(qn!.prizeText).toBe("");
  });

  it("clamps a per_person fee below 1 up to 1 and defaults to fixed", async () => {
    const t = await seeded();
    const low = await t.mutation(api.quinielas.createQuiniela, {
      name: "Low", prizeText: "", numParticipants: 4, prizeMode: "per_person", entryFee: 0,
    });
    const fix = await t.mutation(api.quinielas.createQuiniela, {
      name: "Fix", prizeText: "$1", numParticipants: 4,
    });
    const ql = await t.run((ctx) => ctx.db.get(low.quinielaId));
    const qf = await t.run((ctx) => ctx.db.get(fix.quinielaId));
    expect(ql!.entryFee).toBe(1);
    expect(qf!.prizeMode).toBe("fixed");
    expect(qf!.entryFee).toBeUndefined();
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run convex/quinielas.test.ts -t "per_person"`
Expected: FAIL — `createQuiniela` no acepta `prizeMode`/`entryFee` (validador rechaza args extra) o no los guarda.

- [ ] **Step 3: Implementar en `createQuiniela`**

En `convex/quinielas.ts`, reemplaza el bloque `args` y el cuerpo del handler de `createQuiniela` (líneas 47-74) por:

```ts
export const createQuiniela = mutation({
  args: {
    name: v.string(),
    prizeText: v.string(),
    numParticipants: v.number(),
    photoId: v.optional(v.id("_storage")),
    assignMode: v.optional(v.string()), // "on_join" | "on_reveal"
    prizeMode: v.optional(v.string()),  // "fixed" | "per_person"
    entryFee: v.optional(v.number()),   // requerido en per_person
  },
  handler: async (ctx, args) => {
    const n = Math.max(1, Math.min(48, Math.floor(args.numParticipants)));
    const slotSizes = shuffleInPlace(computeSlotSizes(n, 48), Math.random);
    const adminToken = newToken();
    const joinToken = newToken();
    const perPerson = args.prizeMode === "per_person";
    const entryFee = perPerson ? Math.max(1, Math.floor(args.entryFee ?? 0)) : undefined;
    const quinielaId = await ctx.db.insert("quinielas", {
      name: args.name.trim().slice(0, 60),
      prizeText: perPerson ? "" : args.prizeText.trim().slice(0, 60),
      prizeMode: perPerson ? "per_person" : "fixed",
      entryFee,
      numParticipants: n,
      slotSizes,
      adminToken,
      joinToken,
      status: "open",
      assignMode: args.assignMode === "on_reveal" ? "on_reveal" : "on_join",
      photoId: args.photoId,
      createdAt: Date.now(),
    });
    return { quinielaId, adminToken, joinToken };
  },
});
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run convex/quinielas.test.ts`
Expected: PASS (incluidos los casos existentes).

- [ ] **Step 5: Commit**

```bash
git add convex/quinielas.ts convex/quinielas.test.ts
git commit -m "feat: createQuiniela acepta y valida prizeMode/entryFee"
```

---

## Task 4: Las tres queries devuelven `prize` (sin quitar `prizeText` aún)

**Files:**
- Modify: `convex/types.ts` (añadir `prize` a los tres tipos; `status` en `PersonalData`)
- Modify: `convex/quinielas.ts` (`getOverview`, `getAdmin`: import + `prize`)
- Modify: `convex/participants.ts` (`getPersonalPanel`: import + `prize` + `status`)
- Test: `convex/quinielas.test.ts` (nuevo `describe`)

> Estrategia: se **añade** `prize` (y `status` en Personal) manteniendo `prizeText`. El front sigue compilando porque `prizeText` sigue existiendo. Se elimina en la Task 8.

- [ ] **Step 1: Escribir el test que falla**

En `convex/quinielas.test.ts`, añade un `describe` nuevo al final del archivo:

```ts
describe("getOverview prize", () => {
  it("computes a per_person pool that grows as people join", async () => {
    const t = await seeded();
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "Rifa", prizeText: "", numParticipants: 20, prizeMode: "per_person", entryFee: 200,
    });
    for (const name of ["A", "B", "C"]) {
      await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name });
    }
    let ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    expect(ov.quiniela.prize).toEqual({
      mode: "per_person", text: "", entryFee: 200, pool: 600, contributors: 3,
    });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "D" });
    ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    expect(ov.quiniela.prize.pool).toBe(800);
  });

  it("returns a fixed prize for a legacy quiniela (no prizeMode stored)", async () => {
    const t = await seeded();
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "Vieja", prizeText: "$5,000", numParticipants: 4,
    });
    // simula una fila legacy sin prizeMode
    await t.run((ctx) => ctx.db.patch(q.quinielaId, { prizeMode: undefined }));
    const ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    expect(ov.quiniela.prize.mode).toBe("fixed");
    expect(ov.quiniela.prize.text).toBe("$5,000");
    expect(ov.quiniela.prize.pool).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run convex/quinielas.test.ts -t "getOverview prize"`
Expected: FAIL — `ov.quiniela.prize` no existe.

- [ ] **Step 3: Añadir `prize` a los tipos en `convex/types.ts`**

En `OverviewData`, cambia el objeto `quiniela` para añadir `prize` (mantén `prizeText`):

```ts
export type OverviewData = {
  quiniela: { name: string; photoUrl: string | null; prizeText: string; prize: PrizeView;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished";
              assignMode: AssignMode };
  players: { participantId: string; name: string; photoUrl: string | null;
             aliveCount: number; totalCount: number; status: PlayerStatus }[];
  freeSlots: number;
  upcomingDuels: { homeOwner: string; homeTeam: TeamLite; awayOwner: string;
                   awayTeam: TeamLite; kickoffAt: number }[];
};
```

En `PersonalData`, añade `prize` y `status` (mantén `prizeText`):

```ts
export type PersonalData = {
  quinielaId: string;
  quinielaName: string;
  prizeText: string;
  prize: PrizeView;
  status: "open" | "locked" | "finished";
  joinToken: string;
  me: { name: string; photoUrl: string | null; status: PlayerStatus;
        aliveCount: number; totalCount: number };
  playingNow: { myTeam: TeamLite; opponent: TeamLite; opponentOwner: string;
                kickoffAt: number; status: "live" | "scheduled" }[];
  teams: { team: TeamLite; alive: boolean; group: string;
           nextMatch: { opponent: TeamLite; opponentOwner: string; kickoffAt: number } | null;
           lastResult: string | null }[];
};
```

En `AdminData`, añade `prize` al objeto `quiniela` (mantén `prizeText`):

```ts
export type AdminData = {
  quiniela: { name: string; photoUrl: string | null; prizeText: string; prize: PrizeView;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished";
              joinToken: string; assignMode: AssignMode };
  participants: { name: string; personalToken: string; teamCount: number }[];
  matches: { externalId: string; stage: string; label: string;
             homeTeam: TeamLite | null; awayTeam: TeamLite | null;
             homeExternalId: string | null; awayExternalId: string | null;
             homeScore: number | null; awayScore: number | null;
             status: string; winnerExternalId: string | null; manualOverride: boolean }[];
};
```

- [ ] **Step 4: Poblar `prize` en `getOverview` y `getAdmin`**

En `convex/quinielas.ts`, en el import de `./lib/view` (línea 7) añade `prizeView`:

```ts
import { teamLite, photoUrl, prizeView } from "./lib/view";
```

En `getOverview`, en el objeto de retorno `quiniela` (≈ línea 145), añade `prize` junto a `prizeText`:

```ts
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prizeText: qn.prizeText,
        prize: prizeView(qn, participants.length),
```

En `getAdmin`, en el objeto de retorno `quiniela` (≈ línea 184), añade `prize` igual:

```ts
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prizeText: qn.prizeText,
        prize: prizeView(qn, participants.length),
```

- [ ] **Step 5: Poblar `prize` + `status` en `getPersonalPanel`**

En `convex/participants.ts`, en el import de `./lib/view` (línea 6) añade `prizeView`:

```ts
import { teamLite, photoUrl, prizeView } from "./lib/view";
```

En el objeto de retorno de `getPersonalPanel` (≈ líneas 109-115), añade `prize` y `status`:

```ts
    return {
      quinielaId: qn._id as string, quinielaName: qn.name, prizeText: qn.prizeText,
      prize: prizeView(qn, participants.length),
      status: (championParticipantId ? "finished" : qn.status) as "open" | "locked" | "finished",
      joinToken: qn.joinToken,
      me: { name: me.name, photoUrl: await photoUrl(ctx, me.photoId), status, aliveCount, totalCount: teamsOut.length },
      playingNow,
      teams: teamsOut,
    };
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npm test`
Expected: PASS (los nuevos `getOverview prize` y todos los existentes).

- [ ] **Step 7: Verificar que el build sigue verde**

Run: `npm run build`
Expected: PASS (el front sigue usando `prizeText`, que aún existe).

- [ ] **Step 8: Commit**

```bash
git add convex/types.ts convex/quinielas.ts convex/participants.ts convex/quinielas.test.ts
git commit -m "feat: las queries devuelven el objeto prize (bote calculado)"
```

---

## Task 5: Helpers de front `formatMXN` y `prizeBanner`

**Files:**
- Modify: `src/lib/format.ts` (añadir helpers)
- Test: `src/lib/format.test.ts` (nuevo)

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatMXN, prizeBanner } from "./format";
import type { PrizeView } from "@/../convex/types";

const fixed = (text: string): PrizeView => ({
  mode: "fixed", text, entryFee: null, pool: null, contributors: 0,
});
const perPerson = (entryFee: number, contributors: number): PrizeView => ({
  mode: "per_person", text: "", entryFee, pool: entryFee * contributors, contributors,
});

describe("formatMXN", () => {
  it("formats with es-MX thousands separators", () => {
    expect(formatMXN(1400)).toBe("$1,400");
    expect(formatMXN(0)).toBe("$0");
  });
});

describe("prizeBanner", () => {
  it("fixed: title with the suffix, no subline", () => {
    expect(prizeBanner(fixed("$5,000"), "open", " al campeón"))
      .toEqual({ title: "$5,000 al campeón" });
  });
  it("fixed: empty text renders nothing", () => {
    expect(prizeBanner(fixed(""), "open", " al campeón")).toBeNull();
  });
  it("per_person open: live growing pot", () => {
    expect(prizeBanner(perPerson(200, 7), "open", " al campeón"))
      .toEqual({ title: "Bote: $1,400", subline: "$200 × 7 inscritos" });
  });
  it("per_person open singular", () => {
    expect(prizeBanner(perPerson(200, 1), "open", " al campeón").subline)
      .toBe("$200 × 1 inscrito");
  });
  it("per_person closed: total to the champion", () => {
    expect(prizeBanner(perPerson(200, 8), "locked", " al campeón"))
      .toEqual({ title: "$1,600 al campeón", subline: "8 × $200" });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — `formatMXN`/`prizeBanner` no exportados.

- [ ] **Step 3: Implementar los helpers en `src/lib/format.ts`**

Añade al final de `src/lib/format.ts`:

```ts
import type { PrizeView } from "@/../convex/types";

export function formatMXN(n: number): string {
  return `$${n.toLocaleString("es-MX")}`;
}

/**
 * Arma el banner de premio. Devuelve null si no hay nada que mostrar
 * (modo fijo sin texto). `championSuffix` incluye su espacio inicial,
 * p. ej. " al campeón" o " — para el dueño del campeón".
 */
export function prizeBanner(
  prize: PrizeView,
  status: "open" | "locked" | "finished",
  championSuffix: string,
): { title: string; subline?: string } | null {
  if (prize.mode === "per_person") {
    const fee = formatMXN(prize.entryFee ?? 0);
    const pool = formatMXN(prize.pool ?? 0);
    const n = prize.contributors;
    if (status === "open") {
      return { title: `Bote: ${pool}`, subline: `${fee} × ${n} ${n === 1 ? "inscrito" : "inscritos"}` };
    }
    return { title: `${pool}${championSuffix}`, subline: `${n} × ${fee}` };
  }
  if (!prize.text) return null;
  return { title: `${prize.text}${championSuffix}` };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: helpers formatMXN y prizeBanner en el front"
```

---

## Task 6: `PrizeBanner` con `{ title, subline }` + cableado en Join/Personal

**Files:**
- Modify: `src/components/bits.tsx:24-33` (`PrizeBanner`)
- Modify: `src/routes/Join.tsx` (import + uso del banner)
- Modify: `src/routes/Personal.tsx` (import + uso del banner)

- [ ] **Step 1: Refactor de `PrizeBanner` a `{ title, subline }`**

En `src/components/bits.tsx`, reemplaza la función `PrizeBanner` (líneas 24-33) por:

```tsx
/** Golden prize banner: `🏆 {title}` con subline opcional. */
export function PrizeBanner({ title, subline }: { title: string; subline?: string }) {
  if (!title) return null;
  return (
    <div className="grain relative mt-4 flex items-center gap-2.5 overflow-hidden rounded-2xl border border-gold/30 px-4 py-3 [background:linear-gradient(100deg,oklch(0.32_0.06_84/0.55),oklch(0.28_0.04_70/0.35))]">
      <span className="text-xl leading-none">🏆</span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gold">{title}</div>
        {subline && <div className="text-xs text-gold/70">{subline}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Cablear el banner en `Join.tsx`**

`src/routes/Join.tsx` no importa de `@/lib/format`. Añade una línea de import nueva, justo debajo del import de `@/components/bits` (línea 10):

```tsx
import { prizeBanner } from "@/lib/format";
```

Reemplaza la línea del banner (≈ línea 115):

```tsx
        <PrizeBanner text={quiniela.prizeText && `${quiniela.prizeText} al campeón`} />
```

por (usa una IIFE para no declarar variables fuera del JSX existente):

```tsx
        {(() => {
          const b = prizeBanner(quiniela.prize, quiniela.status, " al campeón");
          return b ? <PrizeBanner title={b.title} subline={b.subline} /> : null;
        })()}
```

- [ ] **Step 3: Cablear el banner en `Personal.tsx`**

En `src/routes/Personal.tsx`, ya existe `import { whenLabel } from "@/lib/format";` (línea 10). Amplíalo a:

```tsx
import { whenLabel, prizeBanner } from "@/lib/format";
```

Reemplaza el bloque del banner (≈ líneas 87-92):

```tsx
        <PrizeBanner
          text={
            data.prizeText && `${data.prizeText} — para el dueño del campeón`
          }
        />
```

por:

```tsx
        {(() => {
          const b = prizeBanner(data.prize, data.status, " — para el dueño del campeón");
          return b ? <PrizeBanner title={b.title} subline={b.subline} /> : null;
        })()}
```

- [ ] **Step 4: Verificar tests y build**

Run: `npm test && npm run build`
Expected: PASS ambos. (`PlayerRow.test.tsx` no toca el banner; el build compila porque `quiniela.prize`/`data.prize`/`data.status` ya existen.)

- [ ] **Step 5: Commit**

```bash
git add src/components/bits.tsx src/routes/Join.tsx src/routes/Personal.tsx
git commit -m "feat: banner de premio con bote dinámico (title + subline)"
```

---

## Task 7: Formulario de creación — toggle de modo + cuota

**Files:**
- Modify: `src/routes/Home.tsx`

- [ ] **Step 1: Añadir estado del modo y la cuota**

En `src/routes/Home.tsx`, dentro del componente `Home`, junto a los otros `useState` (≈ líneas 18-25), añade:

```tsx
  const [prizeMode, setPrizeMode] = useState<"fixed" | "per_person">("fixed");
  const [fee, setFee] = useState(200);
```

- [ ] **Step 2: Enviar los nuevos campos en `submit()`**

En `submit()` (≈ líneas 27-43), reemplaza la llamada a `create({...})` por:

```tsx
      const res = await create({
        name,
        prizeText: prizeMode === "per_person" ? "" : prize,
        numParticipants: n,
        photoId: photoId as Id<"_storage"> | undefined,
        assignMode,
        prizeMode,
        entryFee: prizeMode === "per_person" ? fee : undefined,
      });
```

Y actualiza la guarda de `disabled` (≈ línea 45) para exigir cuota válida en per_person:

```tsx
  const disabled =
    busy || uploading || !name.trim() || n < 2 ||
    (prizeMode === "per_person" && fee < 1);
```

- [ ] **Step 3: Reemplazar el bloque "Premio" por el toggle + campo condicional**

En `src/routes/Home.tsx`, reemplaza el bloque del campo Premio (≈ líneas 89-98, el `<div>` con `<Label htmlFor="prize">Premio</Label>` y su `<Input>`) por:

```tsx
          <div className="flex flex-col gap-2">
            <Label>Premio</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    v: "fixed",
                    title: "Premio fijo",
                    sub: "Un monto o frase para el dueño del campeón.",
                  },
                  {
                    v: "per_person",
                    title: "Por participación 💰",
                    sub: "Cuota por persona; el bote crece con cada quien entra.",
                  },
                ] as const
              ).map((o) => {
                const active = prizeMode === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setPrizeMode(o.v)}
                    aria-pressed={active}
                    className={
                      "rounded-2xl border px-3 py-2.5 text-left transition-colors " +
                      (active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30")
                    }
                  >
                    <div className="text-sm font-bold text-foreground">
                      {o.title}
                    </div>
                    <div className="mt-0.5 text-[0.7rem] leading-snug">
                      {o.sub}
                    </div>
                  </button>
                );
              })}
            </div>
            {prizeMode === "fixed" ? (
              <Input
                id="prize"
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
                placeholder="$5,000 / La gloria eterna"
                maxLength={60}
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-muted-foreground">$</span>
                <Input
                  id="fee"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={fee}
                  onChange={(e) =>
                    setFee(Math.max(1, Math.floor(Number(e.target.value) || 0)))
                  }
                  placeholder="200"
                />
                <span className="text-sm whitespace-nowrap text-muted-foreground">
                  por persona
                </span>
              </div>
            )}
          </div>
```

- [ ] **Step 4: Adaptar la etiqueta de número de participantes según el modo**

En `src/routes/Home.tsx`, en el bloque del número de participantes (≈ líneas 100-121), cambia el `<Label htmlFor="n">` y el texto de ayuda para que reflejen "máximo" en per_person:

```tsx
            <Label htmlFor="n">
              {prizeMode === "per_person"
                ? "Máximo de participantes"
                : "Número de participantes"}
            </Label>
```

y, dentro del mismo bloque, el `<p>` de ayuda (≈ líneas 118-120):

```tsx
            <p className="text-xs text-muted-foreground">
              {prizeMode === "per_person"
                ? "Tope de gente; el bote se arma con los que entren. Los 48 equipos se reparten entre ustedes."
                : "Entre 2 y 48 · los 48 equipos se reparten entre ustedes."}
            </p>
```

- [ ] **Step 5: Verificar tests y build**

Run: `npm test && npm run build`
Expected: PASS ambos.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Home.tsx
git commit -m "feat: toggle premio fijo / por participación en el formulario"
```

---

## Task 8: Limpieza — quitar `prizeText` deprecado de los retornos

**Files:**
- Modify: `convex/types.ts` (quitar `prizeText` de los tres tipos)
- Modify: `convex/quinielas.ts` (`getOverview`, `getAdmin`: quitar `prizeText`)
- Modify: `convex/participants.ts` (`getPersonalPanel`: quitar `prizeText`)

> Tras la Task 6 el front ya no usa `quiniela.prizeText` / `data.prizeText`. Ahora se elimina del contrato de las queries. El campo `prizeText` de la **base de datos** se mantiene (lo usa el modo fijo); solo se deja de exponer el duplicado en los retornos.

- [ ] **Step 1: Confirmar que el front ya no referencia los `prizeText` de los retornos**

Run: `grep -rn "\.prizeText" src`
Expected: sin coincidencias (el banner ya usa `prize`). Si aparece alguna, migrarla a `prize` antes de continuar.

- [ ] **Step 2: Quitar `prizeText` de los tipos de retorno**

En `convex/types.ts`:
- `OverviewData.quiniela`: elimina `prizeText: string;` (deja `prize: PrizeView;`).
- `AdminData.quiniela`: elimina `prizeText: string;` (deja `prize: PrizeView;`).
- `PersonalData`: elimina la línea `prizeText: string;` (deja `prize: PrizeView;`).

- [ ] **Step 3: Quitar `prizeText` de los handlers**

En `convex/quinielas.ts`, en los objetos de retorno `quiniela` de `getOverview` (≈ línea 145) y `getAdmin` (≈ línea 184), elimina `prizeText: qn.prizeText,` dejando solo `prize: prizeView(qn, participants.length),`.

En `convex/participants.ts`, en el retorno de `getPersonalPanel`, elimina `prizeText: qn.prizeText,` dejando `prize: prizeView(qn, participants.length),`.

- [ ] **Step 4: Verificar tests y build**

Run: `npm test && npm run build && npm run lint`
Expected: PASS los tres.

- [ ] **Step 5: Commit**

```bash
git add convex/types.ts convex/quinielas.ts convex/participants.ts
git commit -m "refactor: quitar prizeText duplicado de los retornos (usar prize)"
```

---

## Task 9: Validación end-to-end (Playwright)

**Files:** ninguno (validación manual asistida).

- [ ] **Step 1: Levantar la app**

Sigue el flujo del proyecto para correr front + Convex en local (ver README). Asegúrate de tener datos sembrados.

- [ ] **Step 2: Verificar el flujo per_person con Playwright MCP**

1. Navega a Home, elige **"Por participación 💰"**, cuota `200`, máximo `20`, crea la quiniela.
2. En la pantalla de admin/join, copia el link de inscripción.
3. Inscribe 2–3 participantes (`A`, `B`, `C`).
4. En Join verifica el banner: `Bote: $400` → `$600` conforme entran, con subline `$200 × N inscritos`.
5. Cierra la quiniela (admin) y verifica que el banner pasa a `$600 al campeón` con subline `3 × $200` y que los 48 equipos quedan repartidos entre los 3.

- [ ] **Step 3: Verificar regresión del modo fijo**

Crea una quiniela "Premio fijo" con `$5,000`; confirma que el banner sigue mostrando `$5,000 al campeón` sin subline.

- [ ] **Step 4: Commit (si hubo ajustes)**

Solo si la validación obligó a cambios. Si no, no se commitea nada en esta tarea.

---

## Self-review (cobertura del spec)

- §4 Modelo de datos → Task 1 (schema) + Task 2 (helpers/tipos). ✅
- §5 Cálculo del bote → Task 2 (`prizeView`) + Task 4 (queries). ✅
- §6 Formulario → Task 7. ✅
- §7 Banner + `formatMXN` → Task 5 + Task 6. ✅
- §8 Pruebas → Tasks 2, 3, 4, 5 (unit/integration) + Task 9 (E2E). ✅
- §9 Compatibilidad/legacy → Task 2 (`prizeModeOf`) + Task 4 (test legacy). ✅
- §10 Orden de commits → Tasks 1-8 siguen el orden propuesto, ajustado para mantener el build verde (estrategia añadir→migrar→quitar). ✅
