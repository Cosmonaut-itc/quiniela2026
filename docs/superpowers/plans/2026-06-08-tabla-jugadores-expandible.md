# Tabla de jugadores expandible y colapsable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En la pestaña **General**, cada carta de jugador se expande al tocarla para mostrar sus equipos (bandera + nombre + vivo/fuera), y toda la sección "Tabla de jugadores" se puede colapsar/expandir; arranca expandida.

**Architecture:** El backend (`getOverview`) ya carga en memoria `ownerships`, `states` y `teamById`; se mapea cada ownership del jugador a `{ team, alive }` y se ordena con un comparador puro `sortPlayerTeams` (vivos primero, luego grupo y nombre). El frontend usa un wrapper sobre el primitivo `Collapsible` de Base UI (mismo paquete ya usado por Dialog/Menu/Tabs; sin dependencias nuevas) para dos *disclosures*: cada `PlayerRow` y la sección `PlayersTable`. El panel de Base UI **desmonta** su contenido cuando está cerrado (`keepMounted` por defecto `false`), lo que hace los tests deterministas (contenido ausente cerrado, presente abierto).

**Tech Stack:** React 19 + TypeScript, Convex, `@base-ui/react` (Collapsible), Tailwind v4 + `tw-animate-css`, `lucide-react` (icono chevron), Vitest + Testing Library (jsdom) y `convex-test` (edge-runtime). Sin `@testing-library/user-event` → se usa `fireEvent`.

---

## File Structure

- **Modify** `convex/types.ts` — nuevo tipo `PlayerTeam`; `OverviewData.players[]` gana `teams`.
- **Modify** `convex/lib/view.ts` — nuevo comparador puro `sortPlayerTeams`.
- **Modify** `convex/lib/view.test.ts` — tests de `sortPlayerTeams`.
- **Modify** `convex/quinielas.ts` — `getOverview` arma y ordena `teams` por jugador.
- **Modify** `convex/quinielas.test.ts` — `getOverview` expone `teams` (forma, consistencia, pending vacío).
- **Create** `src/components/ui/collapsible.tsx` — wrapper sobre `@base-ui/react/collapsible`.
- **Modify** `src/components/PlayerRow.tsx` — carta como *disclosure* (equipos al expandir).
- **Modify** `src/components/PlayerRow.test.tsx` — tests expand/collapse y no-expandible.
- **Create** `src/components/PlayersTable.tsx` — sección colapsable (expandida por defecto).
- **Create** `src/components/PlayersTable.test.tsx` — tests de la sección colapsable.
- **Modify** `src/routes/Join.tsx` — usa `<PlayersTable>` en lugar del bloque inline.

---

## Task 1: Tipo `PlayerTeam` + comparador puro `sortPlayerTeams`

**Files:**
- Modify: `convex/types.ts`
- Modify: `convex/lib/view.ts`
- Test: `convex/lib/view.test.ts`

- [ ] **Step 1: Write the failing test**

Añade al final de `convex/lib/view.test.ts` (importa también `sortPlayerTeams` en la línea de import existente):

```ts
import { prizeModeOf, prizeView, sortPlayerTeams } from "./view";
```

```ts
describe("sortPlayerTeams", () => {
  const t = (name: string, group: string, alive: boolean) => ({
    team: { code: name.slice(0, 3).toUpperCase(), name, flag: "🏴", group },
    alive,
  });

  it("pone los equipos vivos antes que los eliminados", () => {
    const out = sortPlayerTeams([t("Brasil", "C", false), t("Argentina", "A", true)]);
    expect(out.map((x) => x.team.name)).toEqual(["Argentina", "Brasil"]);
  });

  it("entre vivos, ordena por grupo y luego por nombre", () => {
    const out = sortPlayerTeams([
      t("México", "A", true),
      t("Japón", "B", true),
      t("Canadá", "A", true),
    ]);
    expect(out.map((x) => x.team.name)).toEqual(["Canadá", "México", "Japón"]);
  });

  it("no muta el arreglo original", () => {
    const input = [t("Brasil", "C", false), t("Argentina", "A", true)];
    const copy = [...input];
    sortPlayerTeams(input);
    expect(input).toEqual(copy);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/view.test.ts`
Expected: FAIL — `sortPlayerTeams is not a function` / export no encontrado.

- [ ] **Step 3: Add the type and the implementation**

En `convex/types.ts`, justo después de la definición de `TeamLite` (`export type TeamLite = …`), añade:

```ts
export type PlayerTeam = { team: TeamLite; alive: boolean };
```

En `convex/lib/view.ts`, amplía el import de tipos y añade la función:

```ts
import type { TeamLite, PrizeMode, PrizeView, PlayerTeam } from "../types";
```

```ts
/** Orden estable de los equipos de un jugador: vivos primero, luego grupo y nombre. */
export function sortPlayerTeams(teams: PlayerTeam[]): PlayerTeam[] {
  return [...teams].sort(
    (a, b) =>
      (b.alive ? 1 : 0) - (a.alive ? 1 : 0) ||
      a.team.group.localeCompare(b.team.group) ||
      a.team.name.localeCompare(b.team.name),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/view.test.ts`
Expected: PASS (todos los `describe`, incluido `sortPlayerTeams`).

- [ ] **Step 5: Commit**

```bash
git add convex/types.ts convex/lib/view.ts convex/lib/view.test.ts
git commit -m "feat(overview): sortPlayerTeams + tipo PlayerTeam

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `getOverview` expone los equipos por jugador

**Files:**
- Modify: `convex/types.ts`
- Modify: `convex/quinielas.ts:1-11` (import) y `getOverview` (`convex/quinielas.ts:157-190`)
- Test: `convex/quinielas.test.ts`

- [ ] **Step 1: Write the failing test**

Dentro del `describe("getOverview", …)` de `convex/quinielas.test.ts` (después del test "ranks players…", antes del cierre del describe), añade:

```ts
  it("expone los equipos de cada jugador (forma y consistencia con aliveCount)", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    // numParticipants=1 → el único jugador se lleva los 48 equipos
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 1 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    const p = ov.players[0];
    expect(p.teams).toHaveLength(p.totalCount);
    expect(p.teams.length).toBeGreaterThan(0);
    // cada equipo trae la forma TeamLite + bandera de vivo
    for (const tm of p.teams) {
      expect(typeof tm.team.code).toBe("string");
      expect(typeof tm.team.name).toBe("string");
      expect(typeof tm.team.flag).toBe("string");
      expect(typeof tm.team.group).toBe("string");
      expect(typeof tm.alive).toBe("boolean");
    }
    // consistencia: los vivos del arreglo coinciden con aliveCount
    expect(p.teams.filter((tm) => tm.alive).length).toBe(p.aliveCount);
  });

  it("devuelve teams vacío para un jugador pending (on_reveal abierto)", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4, assignMode: "on_reveal" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    expect(ov.players[0].status).toBe("pending");
    expect(ov.players[0].teams).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/quinielas.test.ts -t "expone los equipos"`
Expected: FAIL — `p.teams` es `undefined` (la query aún no lo devuelve).

- [ ] **Step 3: Add `teams` to the type**

En `convex/types.ts`, en `OverviewData`, añade `teams` a cada player:

```ts
  players: { participantId: string; name: string; photoUrl: string | null;
             aliveCount: number; totalCount: number; status: PlayerStatus;
             teams: PlayerTeam[] }[];
```

- [ ] **Step 4: Build the teams in `getOverview`**

En `convex/quinielas.ts`, amplía el import de `view` (línea 7):

```ts
import { teamLite, photoUrl, prizeView, sortPlayerTeams } from "./lib/view";
```

En el primer `map` que construye `players` (actualmente `convex/quinielas.ts:157-165`), añade el cálculo de `teams` y propágalo. Reemplaza ese bloque por:

```ts
    const players = participants.map((p) => {
      const mine = ownerships.filter((o) => o.participantId === p._id);
      const aliveCount = mine.filter((o) => states.get(o.teamId as string)!.alive).length;
      const isChampion = championParticipantId === p._id;
      const status: PlayerStatus = pendingReveal ? "pending"
        : isChampion ? "champion" : aliveCount > 0 ? "alive" : "out";
      const teams = sortPlayerTeams(
        mine.map((o) => ({
          team: teamLite(teamById.get(o.teamId as Id<"teams">))!,
          alive: states.get(o.teamId as string)!.alive,
        })),
      );
      return { participantId: p._id as string, name: p.name,
        photoUrlId: p.photoId, aliveCount, totalCount: mine.length, status, teams };
    });
```

En el `Promise.all` del `return` (actualmente `convex/quinielas.ts:187-190`), propaga `teams`. Reemplaza ese bloque por:

```ts
      players: await Promise.all(players.map(async (p) => ({
        participantId: p.participantId, name: p.name, photoUrl: await photoUrl(ctx, p.photoUrlId),
        aliveCount: p.aliveCount, totalCount: p.totalCount, status: p.status, teams: p.teams,
      }))),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run convex/quinielas.test.ts`
Expected: PASS (incluidos los dos tests nuevos y los previos de `getOverview`).

- [ ] **Step 6: Commit**

```bash
git add convex/types.ts convex/quinielas.ts convex/quinielas.test.ts
git commit -m "feat(overview): getOverview expone equipos por jugador

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wrapper `Collapsible` sobre Base UI

**Files:**
- Create: `src/components/ui/collapsible.tsx`

No lleva test unitario propio: es plumbing presentacional; su comportamiento se cubre en los tests de `PlayerRow` (Task 4) y `PlayersTable` (Task 5). Sigue el patrón de `src/components/ui/dropdown-menu.tsx` y `tabs.tsx`.

- [ ] **Step 1: Create the wrapper**

Crea `src/components/ui/collapsible.tsx`:

```tsx
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

import { cn } from "@/lib/utils";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

function CollapsiblePanel({ className, ...props }: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-panel"
      className={cn(
        "overflow-hidden data-open:animate-in data-open:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsibleTrigger, CollapsiblePanel };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: sin errores (si `CollapsiblePrimitive.Root.Props` no existiera, fallaría aquí; es el mismo patrón de namespaces que `TabsPrimitive.Root.Props` y `MenuPrimitive.Root.Props`).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/collapsible.tsx
git commit -m "feat(ui): wrapper Collapsible sobre Base UI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `PlayerRow` como disclosure (equipos al expandir)

**Files:**
- Modify: `src/components/PlayerRow.tsx`
- Test: `src/components/PlayerRow.test.tsx`

- [ ] **Step 1: Write the failing tests**

Reemplaza **todo** el contenido de `src/components/PlayerRow.test.tsx` por:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PlayerRow } from "./PlayerRow";

const team = (name: string, group: string, alive: boolean) => ({
  team: { code: name.slice(0, 3).toUpperCase(), name, flag: "🏴", group },
  alive,
});

describe("PlayerRow", () => {
  it("shows alive count and name", () => {
    render(
      <PlayerRow
        p={{ participantId: "1", name: "Ana", photoUrl: null, aliveCount: 3, totalCount: 5, status: "alive", teams: [] }}
      />,
    );
    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("oculta los equipos hasta que se toca la carta y los muestra al expandir", async () => {
    render(
      <PlayerRow
        p={{
          participantId: "1", name: "Ana", photoUrl: null, aliveCount: 1, totalCount: 2, status: "alive",
          teams: [team("Brasil", "C", true), team("Japón", "E", false)],
        }}
      />,
    );
    // colapsada: el panel no está montado
    expect(screen.queryByText("Brasil")).toBeNull();
    // expandir
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Brasil")).toBeDefined();
    expect(screen.getByText("Japón")).toBeDefined();
    // colapsar de nuevo
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.queryByText("Brasil")).toBeNull());
  });

  it("no es expandible cuando el jugador no tiene equipos", () => {
    render(
      <PlayerRow
        p={{ participantId: "1", name: "Ana", photoUrl: null, aliveCount: 0, totalCount: 0, status: "pending", teams: [] }}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/PlayerRow.test.tsx`
Expected: FAIL — la carta no expande (no hay `button`; `Brasil` nunca aparece).

- [ ] **Step 3: Rewrite `PlayerRow`**

Reemplaza **todo** el contenido de `src/components/PlayerRow.tsx` por:

```tsx
import type { OverviewData } from "@/../convex/types";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Player = OverviewData["players"][number];

/** Un equipo dentro de la carta expandida: bandera + nombre + pastilla vivo/fuera. */
function PlayerTeamRow({ t }: { t: Player["teams"][number] }) {
  const out = !t.alive;
  return (
    <li className={cn("flex items-center justify-between gap-2", out && "opacity-50")}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="text-lg leading-none">{t.team.flag}</span>
        <span className={cn("truncate text-sm", out && "line-through")}>
          {t.team.name}
        </span>
      </span>
      <Badge
        className={cn(
          "shrink-0 border-transparent font-semibold",
          out ? "bg-eliminated/15 text-eliminated" : "bg-alive/15 text-alive",
        )}
      >
        {out ? "Fuera" : "Vivo"}
      </Badge>
    </li>
  );
}

/** Avatar + nombre a la izquierda; conteo de vivos + estado (+ chevron) a la derecha. */
function PlayerSummary({ p, expandable }: { p: Player; expandable: boolean }) {
  const out = p.status === "out";
  const champ = p.status === "champion";
  const pending = p.status === "pending";
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn("relative", champ && "gold-ring rounded-full")}>
          <Avatar name={p.name} url={p.photoUrl} size={38} />
        </div>
        <span
          className={cn(
            "truncate font-heading text-[0.95rem] font-semibold",
            out && "line-through",
          )}
        >
          {p.name}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        {!pending && (
          <span className="flex items-baseline gap-0.5 tabular-nums">
            <span
              className={cn(
                "font-heading text-lg font-bold leading-none",
                champ ? "text-gold" : out ? "text-eliminated" : "text-alive",
              )}
            >
              {p.aliveCount}
            </span>
            <span className="text-xs text-muted-foreground">
              /{p.totalCount} vivos
            </span>
          </span>
        )}
        <StatusBadge status={p.status} />
        {expandable && (
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[panel-open]:rotate-180"
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}

/**
 * Una fila de la tabla de jugadores. Tocar una carta con equipos la expande y
 * revela los equipos del jugador (bandera + nombre + vivo/fuera). Los jugadores
 * sin equipos (p. ej. antes de un sorteo on_reveal) se renderizan como carta
 * estática no expandible. Eliminados atenuados y tachados; el campeón en dorado.
 */
export function PlayerRow({ p }: { p: Player }) {
  const out = p.status === "out";
  const champ = p.status === "champion";
  const expandable = p.teams.length > 0;

  const cardClass = cn(
    "grain relative overflow-hidden rounded-2xl border border-border bg-card transition-colors",
    champ && "gold-ring border-gold/30",
    out && "opacity-45",
  );

  if (!expandable) {
    return (
      <div className={cn(cardClass, "px-3.5 py-3")}>
        <PlayerSummary p={p} expandable={false} />
      </div>
    );
  }

  return (
    <Collapsible defaultOpen={false} className={cardClass}>
      <CollapsibleTrigger className="group w-full px-3.5 py-3 text-left transition-colors hover:bg-secondary/40">
        <PlayerSummary p={p} expandable />
      </CollapsibleTrigger>
      <CollapsiblePanel className="border-t border-border px-3.5 py-2.5">
        <ul className="space-y-1.5">
          {p.teams.map((t) => (
            <PlayerTeamRow key={t.team.code} t={t} />
          ))}
        </ul>
      </CollapsiblePanel>
    </Collapsible>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/PlayerRow.test.tsx`
Expected: PASS (los 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/PlayerRow.tsx src/components/PlayerRow.test.tsx
git commit -m "feat(general): la carta de jugador expande sus equipos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Sección `PlayersTable` colapsable + integración en `Join`

**Files:**
- Create: `src/components/PlayersTable.tsx`
- Test: `src/components/PlayersTable.test.tsx`
- Modify: `src/routes/Join.tsx`

- [ ] **Step 1: Write the failing tests**

Crea `src/components/PlayersTable.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PlayersTable } from "./PlayersTable";

const player = (name: string) => ({
  participantId: name, name, photoUrl: null,
  aliveCount: 1, totalCount: 1, status: "alive" as const, teams: [],
});

describe("PlayersTable", () => {
  it("muestra la lista expandida por defecto", () => {
    render(<PlayersTable players={[player("Ana"), player("Beto")]} freeSlots={0} />);
    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("Beto")).toBeDefined();
  });

  it("colapsa toda la sección al tocar el encabezado", async () => {
    render(<PlayersTable players={[player("Ana")]} freeSlots={0} />);
    fireEvent.click(screen.getByRole("button", { name: /tabla de jugadores/i }));
    await waitFor(() => expect(screen.queryByText("Ana")).toBeNull());
  });

  it("muestra el estado vacío cuando no hay jugadores", () => {
    render(<PlayersTable players={[]} freeSlots={2} />);
    expect(screen.getByText(/sé el primero/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/PlayersTable.test.tsx`
Expected: FAIL — `Cannot find module './PlayersTable'`.

- [ ] **Step 3: Create `PlayersTable`**

Crea `src/components/PlayersTable.tsx`:

```tsx
import type { OverviewData } from "@/../convex/types";
import { ChevronDown } from "lucide-react";
import { PlayerRow } from "@/components/PlayerRow";
import { EmptyTile } from "@/components/bits";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsiblePanel,
} from "@/components/ui/collapsible";

/**
 * Sección colapsable "Tabla de jugadores". Arranca expandida; tocar el encabezado
 * colapsa toda la lista para ahorrar espacio. Cada carta se expande por su cuenta
 * para mostrar los equipos de ese jugador (ver PlayerRow).
 */
export function PlayersTable({
  players,
  freeSlots,
}: {
  players: OverviewData["players"];
  freeSlots: number;
}) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger
        render={<button type="button" />}
        className="group mt-6 mb-2.5 flex w-full items-center justify-between gap-2 px-1 text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground uppercase"
      >
        <span>Tabla de jugadores · {players.length}</span>
        <ChevronDown
          className="size-3.5 shrink-0 transition-transform duration-200 group-data-[panel-open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="space-y-2.5">
          {players.length === 0 ? (
            <EmptyTile>Aún no se inscribe nadie. ¡Sé el primero!</EmptyTile>
          ) : (
            players.map((p) => <PlayerRow key={p.participantId} p={p} />)
          )}
          {freeSlots > 0 && (
            <EmptyTile>
              ＋ {freeSlots} {freeSlots === 1 ? "lugar libre" : "lugares libres"} ·
              esperando jugador
            </EmptyTile>
          )}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/PlayersTable.test.tsx`
Expected: PASS (los 3 tests).

- [ ] **Step 5: Wire `PlayersTable` into `Join`**

En `src/routes/Join.tsx`:

1. Import: elimina la línea `import { PlayerRow } from "@/components/PlayerRow";` y añade:
   ```tsx
   import { PlayersTable } from "@/components/PlayersTable";
   ```
2. Import de bits: cambia
   ```tsx
   import { SectionHeading, PrizeBanner, EmptyTile } from "@/components/bits";
   ```
   por (quita `EmptyTile`, ya no se usa en este archivo):
   ```tsx
   import { SectionHeading, PrizeBanner } from "@/components/bits";
   ```
3. Reemplaza el bloque de la tabla (actualmente `src/routes/Join.tsx:144-158`):
   ```tsx
         <SectionHeading>Tabla de jugadores</SectionHeading>
         <div className="space-y-2.5">
           {data.players.length === 0 ? (
             <EmptyTile>Aún no se inscribe nadie. ¡Sé el primero!</EmptyTile>
           ) : (
             data.players.map((p) => <PlayerRow key={p.participantId} p={p} />)
           )}
           {data.freeSlots > 0 && (
             <EmptyTile>
               ＋ {data.freeSlots}{" "}
               {data.freeSlots === 1 ? "lugar libre" : "lugares libres"} ·
               esperando jugador
             </EmptyTile>
           )}
         </div>
   ```
   por:
   ```tsx
         <PlayersTable players={data.players} freeSlots={data.freeSlots} />
   ```

- [ ] **Step 6: Typecheck + full test run**

Run: `npx tsc -b && npx vitest run`
Expected: typecheck sin errores; toda la suite en verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/PlayersTable.tsx src/components/PlayersTable.test.tsx src/routes/Join.tsx
git commit -m "feat(general): sección Tabla de jugadores colapsable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verificación final (gates + E2E manual con Playwright MCP)

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: sin errores en los archivos tocados. **Nota (memoria del proyecto):** `eslint .` también lintea `.claude/worktrees` de sesiones concurrentes; si aparece un error, revisa primero la **ruta** — si no es uno de los archivos de este plan, no es de este trabajo.

- [ ] **Step 2: Tests + typecheck + build**

Run: `npx vitest run && npm run build`
Expected: toda la suite en verde y `tsc -b && vite build` sin errores.

- [ ] **Step 3: Levantar entorno dev para E2E**

Arranca el backend Convex y el frontend (en segundo plano), y asegura datos del snapshot:

- `npx convex dev` (deja corriendo; siembra el snapshot si el deployment está vacío — el seed es `internal.seed.seedFromSnapshot`).
- `npm run dev` (Vite; deja corriendo).

- [ ] **Step 4: Preparar datos de prueba (vía la app, con Playwright MCP)**

Con `browser_navigate` a la raíz del dev server:
1. Crear una quiniela en modo **on_join** (default) con `numParticipants` ≥ 4.
2. Inscribir 3 jugadores (al unirse en on_join reciben equipos al instante).
3. Abrir la pestaña **General** mediante su `joinToken` (la URL `/q/:id/join/:token`).

- [ ] **Step 5: Verificar el comportamiento E2E (Playwright MCP)**

Comprueba con `browser_snapshot` / `browser_click`:
1. **Carta expandible:** al hacer click en la carta de un jugador, aparecen sus equipos (banderas + nombres + pastilla "Vivo"). El chevron rota.
2. **Independientes:** abrir una segunda carta deja ambas expandidas a la vez.
3. **Colapsar carta:** un segundo click sobre una carta oculta sus equipos.
4. **Sección colapsable:** click en el encabezado "Tabla de jugadores · N" colapsa toda la lista; otro click la vuelve a expandir. Arranca expandida al cargar.
5. Tomar `browser_take_screenshot` de una carta expandida y de la sección colapsada como evidencia.

- [ ] **Step 6: Reportar resultado**

Resume los gates (lint/test/build) y la verificación E2E con la evidencia (capturas). Si algo falla, volver a la tarea correspondiente.

---

## Notas de despliegue

Backend antes que frontend (el front lee `players[].teams`, que el backend debe exponer primero). Validar `npm test`, `npm run build`, `npm run lint` y el E2E manual antes del deploy manual front+back juntos (coordenadas en la memoria del proyecto).
```

