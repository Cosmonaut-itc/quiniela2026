# Overrides de marcador por quiniela — Plan de implementación

> **Para ejecutores:** SUB-SKILL REQUERIDA: usar `superpowers:executing-plans` (inline) o `superpowers:subagent-driven-development`. Los pasos usan checkbox (`- [ ]`). TDD estricto: rojo → verde → commit.

**Goal:** Que una corrección de marcador quede contenida a la quiniela donde se hace, en vez de editar la fila global del partido (que afecta a todas).

**Architecture:** Tabla `matchOverrides` por quiniela. El `matches` global = verdad de la API. Las queries derivan vivos/campeón/standings por quiniela con las funciones puras existentes, alimentadas con los partidos globales + los overrides de esa quiniela. Campeón y `status:"finished"` se derivan en lectura. Incluye revertir al automático y selector de ganador para empates de eliminatoria.

**Tech Stack:** Convex (queries/mutations/internalMutations), Vitest + convex-test (edge-runtime), React + Tailwind/shadcn, Playwright MCP.

**Spec:** `docs/superpowers/specs/2026-06-06-overrides-por-quiniela-design.md`

---

## Reconciliación con `de3fb17` (modo de reparto) y `clearMatchResultManual`

> Mientras se escribía este plan, otra sesión avanzó `main` hasta `de3fb17` (feature
> "modo de reparto on_join/on_reveal") + `clearMatchResultManual` (revert GLOBAL). La rama
> de este trabajo se rebasó sobre ese `main`; el código base == `main`, la rama solo añade docs.
> La arquitectura de overrides por quiniela es **ortogonal** al modo de reparto: se **fusiona**, no se reemplaza.

Deltas a respetar al ejecutar (los bloques de código de abajo se redactaron contra versiones previas):
- **PRESERVAR** en las queries lo que añadió `de3fb17`/`4ddcbf9`:
  - `joinToken` en el retorno de `getPersonalPanel` (`PersonalData.joinToken`) y de `getAdmin` (`quiniela.joinToken`).
  - Lógica `pendingReveal` → `status: "pending"` en `getPersonalPanel` y `getOverview`
    (`pendingReveal = modeOf(qn) === "on_reveal" && qn.status === "open"`).
  - `assignMode: modeOf(qn)` en el objeto `quiniela` de `getOverview` y `getAdmin`.
  - El helper `modeOf` y el tipo `AssignMode` ya existen en `quinielas.ts`/`types.ts`.
  - `PlayerStatus` ya incluye `"pending"`.
  - El `status:"finished"` DERIVADO (`championParticipantId ? "finished" : qn.status`) convive con `assignMode` en el objeto quiniela.
- **ELIMINAR** `clearMatchResultManual` (revert global) de `convex/matches.ts` y su test en
  `convex/matches.test.ts` (decisión del usuario): lo sustituye `clearMatchOverride` por quiniela. La UI aún no lo usaba.
- **Admin.tsx:** fusionar con la sección `reveal`/"🎲 Repartir equipos ahora" (intacta, de `de3fb17`);
  los cambios de revert + selector van solo en la tarjeta de "Corregir marcador".
- **Base CodeRabbit:** `de3fb17` (no `main` viejo).

---

## Estructura de archivos

**Crear:**
- `convex/lib/resolve.ts` — puro: `effectiveMatches`, `championTeamId`, tipo `OverrideRow`.
- `convex/lib/resolve.test.ts` — tests puros.
- `convex/lib/perQuiniela.ts` — `resolveQuiniela(ctx, quinielaId)`: carga global + overrides y deriva (única fuente de la resolución por quiniela).
- `convex/overrides.test.ts` — integración: aislamiento, campeón por quiniela, revert, selector KO, independencia del cron.

**Modificar:**
- `convex/schema.ts` — añadir `matchOverrides`; (T5) `manualOverride` → optional.
- `convex/matches.ts` — reescribir `setMatchResultManual`; añadir `clearMatchOverride`; (T5) recortar `recomputeTeamStates` y `upsertMatchResult`.
- `convex/types.ts` — `AdminData.matches[]` += `homeExternalId`, `awayExternalId`, `winnerExternalId`.
- `convex/mundial.ts`, `convex/participants.ts`, `convex/quinielas.ts` — derivar por quiniela.
- `convex/seed.ts` — (T5) dejar de escribir `manualOverride`.
- `convex/matches.test.ts` — actualizar el test de `setMatchResultManual`.
- `src/routes/Admin.tsx` — botón revertir + selector de ganador + semántica del badge.
- `convex/_generated/**` — regenerado (commitear junto).

**Comandos:** Tests `npm test` · un test `npx vitest run convex/lib/resolve.test.ts` · tipos `npx tsc -p convex` y `npx tsc` · lint `npm run lint` · codegen `npx convex codegen`.

---

## Task 1: Helpers puros de derivación

**Files:**
- Create: `convex/lib/resolve.ts`
- Test: `convex/lib/resolve.test.ts`

- [ ] **Step 1: Test que falla** — `convex/lib/resolve.test.ts`

```ts
// convex/lib/resolve.test.ts
import { describe, it, expect } from "vitest";
import { effectiveMatches, championTeamId, type OverrideRow } from "./resolve";
import { computeTeamStates, type MatchRow, type TeamRow } from "./tournament";

const m = (over: Partial<MatchRow> & { _id: string }): MatchRow => ({
  stage: "group", group: "A", homeTeamId: null, awayTeamId: null,
  homeScore: null, awayScore: null, status: "scheduled", winnerTeamId: null, kickoffAt: 0, ...over,
});

describe("effectiveMatches", () => {
  it("superpone el resultado del override sobre el partido global", () => {
    const matches = [m({ _id: "m1", homeTeamId: "t1", awayTeamId: "t2" })];
    const overrides: OverrideRow[] = [{ matchId: "m1", homeScore: 2, awayScore: 1, status: "finished", winnerTeamId: "t1" }];
    const [eff] = effectiveMatches(matches, overrides);
    expect([eff.homeScore, eff.awayScore, eff.status, eff.winnerTeamId]).toEqual([2, 1, "finished", "t1"]);
    expect(eff.homeTeamId).toBe("t1"); // equipos/etapa intactos
    expect(eff.stage).toBe("group");
  });
  it("deja intactos los partidos sin override", () => {
    const matches = [m({ _id: "m1" }), m({ _id: "m2" })];
    const out = effectiveMatches(matches, [{ matchId: "m1", homeScore: 1, awayScore: 0, status: "finished", winnerTeamId: null }]);
    expect(out[1]).toBe(matches[1]); // misma referencia
    expect(out[0].homeScore).toBe(1);
  });
  it("devuelve el arreglo original cuando no hay overrides", () => {
    const matches = [m({ _id: "m1" })];
    expect(effectiveMatches(matches, [])).toBe(matches);
  });
});

describe("championTeamId", () => {
  it("devuelve el equipo que ganó la final", () => {
    const teams: TeamRow[] = [{ _id: "t1", group: "A" }, { _id: "t2", group: "A" }];
    const states = computeTeamStates(teams, [m({ _id: "f", stage: "final", homeTeamId: "t1", awayTeamId: "t2", homeScore: 1, awayScore: 0, status: "finished", winnerTeamId: "t1" })]);
    expect(championTeamId(states)).toBe("t1");
  });
  it("devuelve null si la final no está decidida", () => {
    expect(championTeamId(computeTeamStates([{ _id: "t1", group: "A" }], []))).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npx vitest run convex/lib/resolve.test.ts` → FAIL ("Cannot find module './resolve'").

- [ ] **Step 3: Implementación** — `convex/lib/resolve.ts`

```ts
// convex/lib/resolve.ts
import type { MatchRow, TeamState } from "./tournament";

export type OverrideRow = {
  matchId: string;
  homeScore: number;
  awayScore: number;
  status: string;
  winnerTeamId: string | null;
};

/**
 * Partidos globales con los overrides de UNA quiniela encima. El override solo
 * reemplaza el resultado (score/status/winner); equipos, etapa, grupo y kickoff
 * quedan como la verdad global (API). Los partidos sin override se devuelven tal cual.
 */
export function effectiveMatches(matches: MatchRow[], overrides: OverrideRow[]): MatchRow[] {
  if (overrides.length === 0) return matches;
  const byId = new Map(overrides.map((o) => [o.matchId, o]));
  return matches.map((mt) => {
    const o = byId.get(mt._id);
    return o
      ? { ...mt, homeScore: o.homeScore, awayScore: o.awayScore, status: o.status, winnerTeamId: o.winnerTeamId }
      : mt;
  });
}

/** El equipo cuyo estado derivado es "champion", o null si la final no está decidida. */
export function championTeamId(states: Map<string, TeamState>): string | null {
  for (const [id, s] of states) if (s.currentStage === "champion") return id;
  return null;
}
```

- [ ] **Step 4: Verificar verde** — `npx vitest run convex/lib/resolve.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/resolve.ts convex/lib/resolve.test.ts
git commit -m "feat: helpers puros effectiveMatches y championTeamId para derivación por quiniela"
```

---

## Task 2: Tabla `matchOverrides` (aditiva)

**Files:** Modify `convex/schema.ts`; regen `convex/_generated/**`.

- [ ] **Step 1: Añadir la tabla** — en `convex/schema.ts`, dentro de `defineSchema({...})`, tras `ownerships`:

```ts
  matchOverrides: defineTable({
    quinielaId: v.id("quinielas"),
    matchId: v.id("matches"),
    homeScore: v.number(),
    awayScore: v.number(),
    status: v.string(), // "finished" | "live"
    winnerTeamId: v.optional(v.id("teams")),
  })
    .index("by_quiniela", ["quinielaId"])
    .index("by_quiniela_match", ["quinielaId", "matchId"]),
```

(En esta tarea NO se toca `manualOverride`; se relaja en T5.)

- [ ] **Step 2: Regenerar tipos** — `npx convex codegen` → actualiza `convex/_generated/`.

- [ ] **Step 3: Verificar que nada se rompió** — `npx tsc -p convex && npm test` → tsc limpio, los 28 tests verdes (cambio aditivo).

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/_generated
git commit -m "feat: tabla matchOverrides (override de marcador por quiniela)"
```

---

## Task 3: Las queries derivan por quiniela (preserva comportamiento con cero overrides)

**Files:** Create `convex/lib/perQuiniela.ts`; Modify `convex/types.ts`, `convex/mundial.ts`, `convex/participants.ts`, `convex/quinielas.ts`.

- [ ] **Step 1: Helper de resolución** — `convex/lib/perQuiniela.ts`

```ts
// convex/lib/perQuiniela.ts
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { computeTeamStates, type MatchRow, type TeamRow, type TeamState } from "./tournament";
import { effectiveMatches, championTeamId } from "./resolve";

export type Resolved = {
  teams: Doc<"teams">[];
  teamById: Map<Id<"teams">, Doc<"teams">>;
  teamRows: TeamRow[];
  matches: Doc<"matches">[];
  effRows: MatchRow[];
  effById: Map<string, MatchRow>;
  overriddenMatchIds: Set<string>;
  states: Map<string, TeamState>;
  championTeamId: string | null;
};

/** Carga el estado global + los overrides de una quiniela y deriva vivos/campeón
 *  PARA ESA QUINIELA. Única fuente de la resolución por quiniela. */
export async function resolveQuiniela(ctx: QueryCtx, quinielaId: Id<"quinielas">): Promise<Resolved> {
  const teams = await ctx.db.query("teams").collect();
  const matches = await ctx.db.query("matches").collect();
  const overrides = await ctx.db.query("matchOverrides")
    .withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId)).collect();

  const teamRows: TeamRow[] = teams.map((t) => ({ _id: t._id as string, group: t.group }));
  const matchRows: MatchRow[] = matches.map((mt) => ({
    _id: mt._id as string, stage: mt.stage, group: mt.group,
    homeTeamId: mt.homeTeamId ?? null, awayTeamId: mt.awayTeamId ?? null,
    homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
    status: mt.status, winnerTeamId: mt.winnerTeamId ?? null, kickoffAt: mt.kickoffAt,
  }));
  const overrideRows = overrides.map((o) => ({
    matchId: o.matchId as string, homeScore: o.homeScore, awayScore: o.awayScore,
    status: o.status, winnerTeamId: (o.winnerTeamId as string) ?? null,
  }));

  const effRows = effectiveMatches(matchRows, overrideRows);
  const states = computeTeamStates(teamRows, effRows);
  return {
    teams, teamById: new Map(teams.map((t) => [t._id, t])), teamRows,
    matches, effRows, effById: new Map(effRows.map((mt) => [mt._id, mt])),
    overriddenMatchIds: new Set(overrides.map((o) => o.matchId as string)),
    states, championTeamId: championTeamId(states),
  };
}
```

- [ ] **Step 2: Tipos de admin** — en `convex/types.ts`, reemplazar el objeto de `AdminData.matches`:

```ts
  matches: { externalId: string; stage: string; label: string;
             homeTeam: TeamLite | null; awayTeam: TeamLite | null;
             homeExternalId: string | null; awayExternalId: string | null;
             homeScore: number | null; awayScore: number | null;
             status: string; winnerExternalId: string | null; manualOverride: boolean }[];
```

- [ ] **Step 3: `getMundial` deriva** — reemplazar el handler en `convex/mundial.ts` (imports: añadir `import { resolveQuiniela } from "./lib/perQuiniela";` y quitar el import de `computeGroupStandings`… NO, se sigue usando):

```ts
export const getMundial = query({
  args: { quinielaId: v.id("quinielas") },
  handler: async (ctx, { quinielaId }): Promise<MundialData> => {
    const { teams, teamById, teamRows, matches, effRows, effById, states } = await resolveQuiniela(ctx, quinielaId);
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId)).collect();
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId)).collect();
    const nameById = new Map(participants.map((p) => [p._id, p]));
    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));
    const ownerName = (teamId?: Id<"teams"> | string | null) => {
      const tid = teamId as Id<"teams"> | null | undefined;
      return tid && ownerByTeam.has(tid) ? nameById.get(ownerByTeam.get(tid)!)?.name ?? "—" : "Sin dueño";
    };

    const groupLetters = [...new Set(teams.map((t) => t.group))].sort();
    const groups = await Promise.all(groupLetters.map(async (g) => {
      const standings = computeGroupStandings(g, teamRows, effRows);
      const rows = await Promise.all(standings.map(async (s) => {
        const teamId = s.teamId as Id<"teams">;
        const tm = teamById.get(teamId)!;
        const ownerId = ownerByTeam.get(teamId);
        return {
          team: teamLite(tm)!, points: s.points, gd: s.gd, gf: s.gf,
          ownerName: ownerName(teamId), alive: states.get(teamId as string)!.alive,
          ownerPhotoUrl: ownerId ? await photoUrl(ctx, nameById.get(ownerId)?.photoId) : null,
        };
      }));
      return { group: g, rows };
    }));

    const bracket = BRACKET_STAGES.map(({ stage, label }) => ({
      stage, label,
      matches: matches.filter((mt) => mt.stage === stage).sort((a, b) => a.kickoffAt - b.kickoffAt).map((mt) => {
        const e = effById.get(mt._id as string)!;
        return {
          home: mt.homeTeamId ? { team: teamLite(teamById.get(mt.homeTeamId))!, owner: ownerName(mt.homeTeamId) } : null,
          away: mt.awayTeamId ? { team: teamLite(teamById.get(mt.awayTeamId))!, owner: ownerName(mt.awayTeamId) } : null,
          homeScore: e.homeScore, awayScore: e.awayScore,
          winnerTeamId: e.winnerTeamId, status: e.status,
        };
      }),
    })).filter((s) => s.matches.length > 0);

    return { groups, bracket };
  },
});
```

- [ ] **Step 4: `getPersonalPanel` deriva** — en `convex/participants.ts`, reemplazar el cuerpo del handler (tras validar `me`/`qn`):

```ts
    const { teamById, effRows, states, championTeamId: champTeam } = await resolveQuiniela(ctx, me.quinielaId);
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const nameById = new Map(participants.map((p) => [p._id, p.name]));
    const championParticipantId = champTeam ? ownerByTeam.get(champTeam as Id<"teams">) ?? null : null;

    const myTeamIds = ownerships.filter((o) => o.participantId === me._id).map((o) => o.teamId);

    function nextMatchFor(teamId: string) {
      return effRows
        .filter((mt) => mt.status !== "finished" && (mt.homeTeamId === teamId || mt.awayTeamId === teamId))
        .sort((a, b) => a.kickoffAt - b.kickoffAt)[0];
    }
    function lastResultFor(teamId: string) {
      const mt = effRows
        .filter((x) => x.status === "finished" && (x.homeTeamId === teamId || x.awayTeamId === teamId))
        .sort((a, b) => b.kickoffAt - a.kickoffAt)[0];
      if (!mt) return null;
      const h = teamById.get(mt.homeTeamId as Id<"teams">); const aw = teamById.get(mt.awayTeamId as Id<"teams">);
      return `${h?.flag ?? ""} ${mt.homeScore}–${mt.awayScore} ${aw?.flag ?? ""}`;
    }

    const teamsOut = myTeamIds.map((teamId) => {
      const tm = teamById.get(teamId)!;
      const nm = nextMatchFor(teamId as string);
      let nextMatch = null as PersonalData["teams"][number]["nextMatch"];
      if (nm) {
        const oppId = nm.homeTeamId === (teamId as string) ? nm.awayTeamId : nm.homeTeamId;
        if (oppId) {
          nextMatch = {
            opponent: teamLite(teamById.get(oppId as Id<"teams">))!,
            opponentOwner: ownerByTeam.has(oppId as Id<"teams">) ? nameById.get(ownerByTeam.get(oppId as Id<"teams">)!) ?? "—" : "Sin dueño",
            kickoffAt: nm.kickoffAt,
          };
        }
      }
      return { team: teamLite(tm)!, alive: states.get(teamId as string)!.alive, group: tm.group, nextMatch, lastResult: lastResultFor(teamId as string) };
    });

    const aliveCount = teamsOut.filter((x) => x.alive).length;
    const status: PlayerStatus = championParticipantId === me._id ? "champion" : aliveCount > 0 ? "alive" : "out";

    const soon = Date.now() + 3 * 3600_000;
    const playingNow = teamsOut
      .filter((x) => x.nextMatch && x.nextMatch.kickoffAt <= soon)
      .map((x) => ({
        myTeam: x.team, opponent: x.nextMatch!.opponent, opponentOwner: x.nextMatch!.opponentOwner,
        kickoffAt: x.nextMatch!.kickoffAt,
        status: (x.nextMatch!.kickoffAt <= Date.now() ? "live" : "scheduled") as "live" | "scheduled",
      }));

    return {
      quinielaId: qn._id as string, quinielaName: qn.name, prizeText: qn.prizeText,
      me: { name: me.name, photoUrl: await photoUrl(ctx, me.photoId), status, aliveCount, totalCount: teamsOut.length },
      playingNow,
      teams: teamsOut,
    };
```

Imports en `participants.ts`: añadir `import { resolveQuiniela } from "./lib/perQuiniela";` y `import type { Id } from "./_generated/dataModel";` (si no está).

- [ ] **Step 5: `getOverview` y `getAdmin` derivan** — en `convex/quinielas.ts`, añadir `import { resolveQuiniela } from "./lib/perQuiniela";`.

`getOverview` (reemplazar desde la carga de teams):

```ts
    const { teamById, effRows, states, championTeamId: champTeam } = await resolveQuiniela(ctx, qn._id);
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));
    const championParticipantId = champTeam ? ownerByTeam.get(champTeam as Id<"teams">) ?? null : null;

    const players = participants.map((p) => {
      const mine = ownerships.filter((o) => o.participantId === p._id);
      const aliveCount = mine.filter((o) => states.get(o.teamId as string)!.alive).length;
      const isChampion = championParticipantId === p._id;
      const status: PlayerStatus = isChampion ? "champion" : aliveCount > 0 ? "alive" : "out";
      return { participantId: p._id as string, name: p.name, photoUrlId: p.photoId, aliveCount, totalCount: mine.length, status };
    });
    players.sort((a, b) =>
      (b.status === "out" ? 0 : 1) - (a.status === "out" ? 0 : 1) || b.aliveCount - a.aliveCount);

    const upcoming = [...effRows]
      .filter((mt) => mt.status !== "finished" && mt.homeTeamId && mt.awayTeamId
        && ownerByTeam.has(mt.homeTeamId as Id<"teams">) && ownerByTeam.has(mt.awayTeamId as Id<"teams">))
      .sort((a, b) => a.kickoffAt - b.kickoffAt)
      .slice(0, 8);
    const nameById = new Map(participants.map((p) => [p._id, p.name]));

    return {
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prizeText: qn.prizeText,
        numParticipants: qn.numParticipants, filledCount: participants.length,
        status: (championParticipantId ? "finished" : qn.status) as "open" | "locked" | "finished",
      },
      players: await Promise.all(players.map(async (p) => ({
        participantId: p.participantId, name: p.name, photoUrl: await photoUrl(ctx, p.photoUrlId),
        aliveCount: p.aliveCount, totalCount: p.totalCount, status: p.status,
      }))),
      freeSlots: Math.max(0, qn.numParticipants - participants.length),
      upcomingDuels: upcoming.map((mt) => ({
        homeOwner: nameById.get(ownerByTeam.get(mt.homeTeamId as Id<"teams">)!) ?? "",
        homeTeam: teamLite(teamById.get(mt.homeTeamId as Id<"teams">))!,
        awayOwner: nameById.get(ownerByTeam.get(mt.awayTeamId as Id<"teams">)!) ?? "",
        awayTeam: teamLite(teamById.get(mt.awayTeamId as Id<"teams">))!,
        kickoffAt: mt.kickoffAt,
      })),
    };
```

`getAdmin` (reemplazar desde la carga de teams):

```ts
    const { teamById, effById, overriddenMatchIds, matches, championTeamId: champTeam } = await resolveQuiniela(ctx, qn._id);
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));
    const championParticipantId = champTeam ? ownerByTeam.get(champTeam as Id<"teams">) ?? null : null;

    const STAGE_LABEL: Record<string, string> = {
      group: "Grupos", r32: "Dieciseisavos", r16: "Octavos", qf: "Cuartos",
      sf: "Semis", third: "3er lugar", final: "Final",
    };
    const sorted = [...matches].sort((a, b) => a.kickoffAt - b.kickoffAt);
    return {
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prizeText: qn.prizeText,
        numParticipants: qn.numParticipants, filledCount: participants.length,
        status: (championParticipantId ? "finished" : qn.status) as "open" | "locked" | "finished",
        joinToken: qn.joinToken,
      },
      participants: participants.map((p) => ({
        name: p.name, personalToken: p.personalToken,
        teamCount: ownerships.filter((o) => o.participantId === p._id).length,
      })),
      matches: sorted.map((mt) => {
        const e = effById.get(mt._id as string)!;
        const winner = e.winnerTeamId ? teamById.get(e.winnerTeamId as Id<"teams">) : null;
        return {
          externalId: mt.externalId, stage: mt.stage, label: STAGE_LABEL[mt.stage] ?? mt.stage,
          homeTeam: mt.homeTeamId ? teamLite(teamById.get(mt.homeTeamId)) : null,
          awayTeam: mt.awayTeamId ? teamLite(teamById.get(mt.awayTeamId)) : null,
          homeExternalId: mt.homeTeamId ? teamById.get(mt.homeTeamId)?.externalId ?? null : null,
          awayExternalId: mt.awayTeamId ? teamById.get(mt.awayTeamId)?.externalId ?? null : null,
          homeScore: e.homeScore, awayScore: e.awayScore, status: e.status,
          winnerExternalId: winner?.externalId ?? null,
          manualOverride: overriddenMatchIds.has(mt._id as string),
        };
      }),
    };
```

- [ ] **Step 6: Verificar verde** — `npx tsc -p convex && npm test` → tsc limpio; los 28 tests siguen verdes (cero overrides ⇒ idéntico al baseline global).

- [ ] **Step 7: Commit**

```bash
git add convex/lib/perQuiniela.ts convex/types.ts convex/mundial.ts convex/participants.ts convex/quinielas.ts
git commit -m "refactor: las queries por quiniela derivan vivos/campeón con overrides (sin cambio a cero overrides)"
```

---

## Task 4: Write path — `setMatchResultManual` por quiniela + `clearMatchOverride`

**Files:** Modify `convex/matches.ts`, `convex/matches.test.ts`; Create `convex/overrides.test.ts`.

- [ ] **Step 1: Tests de integración** — `convex/overrides.test.ts`

```ts
// convex/overrides.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

/** Quiniela cerrada con 1 participante que termina dueño de los 48 equipos. */
async function closedSolo(t: ReturnType<typeof convexTest>, name: string) {
  const q = await t.mutation(api.quinielas.createQuiniela, { name, prizeText: "$1", numParticipants: 1 });
  await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: `${name}-p` });
  await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
  return q;
}
/** Asigna dos equipos reales (758/759) a un partido de eliminatoria global y devuelve su externalId. */
async function assignKnockout(t: ReturnType<typeof convexTest>) {
  const km = await t.run((ctx) => ctx.db.query("matches").filter((q) => q.neq(q.field("stage"), "group")).first());
  await t.mutation(internal.matches.upsertMatchResult, {
    match: { externalId: km!.externalId, stage: km!.stage, group: null,
      homeExternalId: "758", awayExternalId: "759", kickoffAt: km!.kickoffAt,
      homeScore: null, awayScore: null, status: "scheduled", winnerExternalId: null, bracketSlot: km!.bracketSlot ?? null },
  });
  return km!.externalId;
}
const aliveCount = (t: ReturnType<typeof convexTest>, joinToken: string) =>
  t.query(api.quinielas.getOverview, { joinToken }).then((o) => o.players[0].aliveCount);

describe("overrides por quiniela", () => {
  it("AISLAMIENTO: corregir en A no cambia los vivos de B", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const ext = await assignKnockout(t);
    const a = await closedSolo(t, "A"); const b = await closedSolo(t, "B");
    // A corrige el KO: 758 gana 1-0 → 759 eliminado SOLO en A
    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: a.adminToken, matchExternalId: ext, homeScore: 1, awayScore: 0, finished: true });
    expect(await aliveCount(t, a.joinToken)).toBe(47);
    expect(await aliveCount(t, b.joinToken)).toBe(48); // B intacto
    // el global tampoco cambió (no se llamó recompute)
    const t759 = await t.run((ctx) => ctx.db.query("teams").withIndex("by_externalId", (q) => q.eq("externalId", "759")).first());
    expect(t759!.alive).toBe(true);
    // no se escribió la fila global del partido
    const gm = await t.run((ctx) => ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", ext)).first());
    expect(gm!.status).toBe("scheduled");
    expect(gm!.homeScore ?? null).toBeNull();
  });

  it("SELECTOR KO: empate con winnerExternalId elimina al perdedor solo en A", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const ext = await assignKnockout(t);
    const a = await closedSolo(t, "A"); const b = await closedSolo(t, "B");
    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: a.adminToken, matchExternalId: ext, homeScore: 1, awayScore: 1, finished: true, winnerExternalId: "759" });
    expect(await aliveCount(t, a.joinToken)).toBe(47);
    expect(await aliveCount(t, b.joinToken)).toBe(48);
    const t758 = await t.run((ctx) => ctx.db.query("teams").withIndex("by_externalId", (q) => q.eq("externalId", "758")).first());
    const personal = await t.query(api.participants.getPersonalPanel, {
      personalToken: (await t.run((ctx) => ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", a.quinielaId)).first()))!.personalToken });
    const team758 = personal.teams.find((x) => x.team.code === t758!.code);
    expect(team758!.alive).toBe(false); // el perdedor explícito (758) está eliminado en A
  });

  it("REVERT: clearMatchOverride devuelve A al resultado automático", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const ext = await assignKnockout(t);
    const a = await closedSolo(t, "A");
    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: a.adminToken, matchExternalId: ext, homeScore: 1, awayScore: 0, finished: true });
    expect(await aliveCount(t, a.joinToken)).toBe(47);
    await t.mutation(api.matches.clearMatchOverride, { adminToken: a.adminToken, matchExternalId: ext });
    expect(await aliveCount(t, a.joinToken)).toBe(48); // volvió al automático
  });

  it("CAMPEÓN POR QUINIELA: A corrige la final con otro ganador que la API", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    // asignar 758/759 a la FINAL y que la API la dé ganada por 758
    const fm = await t.run((ctx) => ctx.db.query("matches").withIndex("by_stage_kickoff", (q) => q.eq("stage", "final")).first());
    const ext = fm!.externalId;
    await t.mutation(internal.matches.upsertMatchResult, {
      match: { externalId: ext, stage: "final", group: null, homeExternalId: "758", awayExternalId: "759",
        kickoffAt: fm!.kickoffAt, homeScore: 2, awayScore: 0, status: "finished", winnerExternalId: "758", bracketSlot: fm!.bracketSlot ?? null } });
    await t.mutation(internal.matches.recomputeTeamStates, {});
    const a = await closedSolo(t, "A"); const b = await closedSolo(t, "B");
    // A corrige la final: gana 759
    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: a.adminToken, matchExternalId: ext, homeScore: 1, awayScore: 2, finished: true, winnerExternalId: "759" });
    const ovA = await t.query(api.quinielas.getOverview, { joinToken: a.joinToken });
    const ovB = await t.query(api.quinielas.getOverview, { joinToken: b.joinToken });
    expect(ovA.quiniela.status).toBe("finished");
    expect(ovA.players[0].status).toBe("champion");
    expect(ovB.quiniela.status).toBe("finished"); // B sigue la API (también hay campeón global)
    expect(ovB.players[0].status).toBe("champion");
    // …pero el campeón de A se derivó de su override, no del global (distinto winner): se valida que A no usa la final global
    const adminA = await t.query(api.quinielas.getAdmin, { adminToken: a.adminToken });
    const finalRow = adminA.matches.find((mm) => mm.externalId === ext)!;
    expect(finalRow.winnerExternalId).toBe("759"); // A ve a 759 como ganador de la final
    expect(finalRow.manualOverride).toBe(true);
  });
});
```

- [ ] **Step 2: Actualizar el test existente** — en `convex/matches.test.ts`, reemplazar el bloque `it("setMatchResultManual uses an explicit winnerExternalId on a tied knockout", ...)` por la versión que verifica el OVERRIDE (no la fila global):

```ts
  it("setMatchResultManual guarda un override por quiniela (no toca el partido global)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const km = await t.run((ctx) =>
      ctx.db.query("matches").filter((q) => q.neq(q.field("stage"), "group")).first());
    const externalId = km!.externalId;
    await t.mutation(internal.matches.upsertMatchResult, {
      match: { externalId, stage: km!.stage, group: null,
        homeExternalId: "758", awayExternalId: "759", kickoffAt: km!.kickoffAt,
        homeScore: null, awayScore: null, status: "scheduled",
        winnerExternalId: null, bracketSlot: km!.bracketSlot ?? null },
    });
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: q.adminToken, matchExternalId: externalId,
      homeScore: 1, awayScore: 1, finished: true, winnerExternalId: "759",
    });
    const winner = await t.run((ctx) =>
      ctx.db.query("teams").withIndex("by_externalId", (q) => q.eq("externalId", "759")).first());
    // el override de ESTA quiniela lleva el ganador explícito
    const ovr = await t.run((ctx) =>
      ctx.db.query("matchOverrides").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).first());
    expect(ovr!.winnerTeamId).toBe(winner!._id);
    expect(ovr!.status).toBe("finished");
    // el partido GLOBAL queda intacto (sigue la API)
    const stored = await t.run((ctx) =>
      ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", externalId)).first());
    expect(stored!.winnerTeamId ?? null).toBeNull();
    expect(stored!.status).toBe("scheduled");
  });
```

- [ ] **Step 3: Verificar que fallan** — `npx vitest run convex/overrides.test.ts convex/matches.test.ts` → FAIL (`clearMatchOverride` no existe; `setMatchResultManual` aún escribe el global).

- [ ] **Step 4: Reescribir el write path** — en `convex/matches.ts`: quitar `import { internal } from "./_generated/api";` (queda sin uso aquí), reemplazar `setMatchResultManual` y añadir `clearMatchOverride`:

```ts
export const setMatchResultManual = mutation({
  args: { adminToken: v.string(), matchExternalId: v.string(),
          homeScore: v.number(), awayScore: v.number(), finished: v.boolean(),
          winnerExternalId: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const match = await ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", args.matchExternalId)).first();
    if (!match) throw new Error("Partido no encontrado");
    // Ganador explícito (penales/prórroga) o derivado del marcador; usa los equipos del partido global.
    const winnerTeamId = !args.finished ? undefined
      : typeof args.winnerExternalId === "string" ? await teamIdByExternal(ctx, args.winnerExternalId)
      : args.homeScore > args.awayScore ? match.homeTeamId
      : args.awayScore > args.homeScore ? match.awayTeamId : undefined;
    const fields = {
      quinielaId: qn._id, matchId: match._id,
      homeScore: args.homeScore, awayScore: args.awayScore,
      status: args.finished ? "finished" : "live",
      winnerTeamId,
    };
    const existing = await ctx.db.query("matchOverrides")
      .withIndex("by_quiniela_match", (q) => q.eq("quinielaId", qn._id).eq("matchId", match._id)).first();
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("matchOverrides", fields);
    return { ok: true as const };
  },
});

export const clearMatchOverride = mutation({
  args: { adminToken: v.string(), matchExternalId: v.string() },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const match = await ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", args.matchExternalId)).first();
    if (!match) throw new Error("Partido no encontrado");
    const existing = await ctx.db.query("matchOverrides")
      .withIndex("by_quiniela_match", (q) => q.eq("quinielaId", qn._id).eq("matchId", match._id)).first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true as const };
  },
});
```

- [ ] **Step 5: Verificar verde** — `npx tsc -p convex && npm test` → todo verde.

- [ ] **Step 6: Commit**

```bash
git add convex/matches.ts convex/matches.test.ts convex/overrides.test.ts convex/_generated
git commit -m "feat: corrección manual escribe override por quiniela + clearMatchOverride (revertir)"
```

---

## Task 5: El estado global vuelve a ser verdad-API pura

**Files:** Modify `convex/matches.ts`, `convex/seed.ts`, `convex/schema.ts`; add test in `convex/overrides.test.ts`; regen `_generated`.

- [ ] **Step 1: Test guard** — añadir en `convex/overrides.test.ts` dentro del `describe`:

```ts
  it("recomputeTeamStates ya NO finaliza el campeón de ninguna quiniela (se deriva en lectura)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const fm = await t.run((ctx) => ctx.db.query("matches").withIndex("by_stage_kickoff", (q) => q.eq("stage", "final")).first());
    await t.mutation(internal.matches.upsertMatchResult, {
      match: { externalId: fm!.externalId, stage: "final", group: null, homeExternalId: "758", awayExternalId: "759",
        kickoffAt: fm!.kickoffAt, homeScore: 2, awayScore: 0, status: "finished", winnerExternalId: "758", bracketSlot: fm!.bracketSlot ?? null } });
    const a = await closedSolo(t, "A");
    await t.mutation(internal.matches.recomputeTeamStates, {});
    const qn = await t.run((ctx) => ctx.db.get(a.quinielaId));
    expect(qn!.championParticipantId ?? null).toBeNull(); // recompute no escribe el campeón
    expect(qn!.status).toBe("locked");                    // ni cambia el status a finished
    // pero la lectura SÍ deriva el campeón (la API dio ganador)
    const ov = await t.query(api.quinielas.getOverview, { joinToken: a.joinToken });
    expect(ov.quiniela.status).toBe("finished");
  });

  it("INDEPENDENCIA DEL CRON: tras override en A, el cron actualiza el global y B lo ve; A conserva su override", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const ext = await assignKnockout(t);
    const a = await closedSolo(t, "A"); const b = await closedSolo(t, "B");
    // A: 758 gana → 759 fuera en A
    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: a.adminToken, matchExternalId: ext, homeScore: 1, awayScore: 0, finished: true });
    // cron: la API dice que ganó 759 → global recomputa
    await t.mutation(internal.matches.upsertMatchResult, {
      match: { externalId: ext, stage: (await t.run((ctx) => ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", ext)).first()))!.stage,
        group: null, homeExternalId: "758", awayExternalId: "759", kickoffAt: 0,
        homeScore: 0, awayScore: 2, status: "finished", winnerExternalId: "759", bracketSlot: null } });
    await t.mutation(internal.matches.recomputeTeamStates, {});
    const persB = await t.query(api.participants.getPersonalPanel, {
      personalToken: (await t.run((ctx) => ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", b.quinielaId)).first()))!.personalToken });
    const persA = await t.query(api.participants.getPersonalPanel, {
      personalToken: (await t.run((ctx) => ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", a.quinielaId)).first()))!.personalToken });
    const code = (panel: typeof persA, ext2: string) => panel; // helper de legibilidad
    // B sigue la API: 758 eliminado (perdió 0-2)
    const t758 = await t.run((ctx) => ctx.db.query("teams").withIndex("by_externalId", (q) => q.eq("externalId", "758")).first());
    const t759 = await t.run((ctx) => ctx.db.query("teams").withIndex("by_externalId", (q) => q.eq("externalId", "759")).first());
    expect(persB.teams.find((x) => x.team.code === t758!.code)!.alive).toBe(false);
    expect(persB.teams.find((x) => x.team.code === t759!.code)!.alive).toBe(true);
    // A conserva su override: 758 vivo, 759 fuera
    expect(persA.teams.find((x) => x.team.code === t758!.code)!.alive).toBe(true);
    expect(persA.teams.find((x) => x.team.code === t759!.code)!.alive).toBe(false);
  });
```

(Quitar la línea `const code = …` si lint se queja de variable sin uso; es solo ilustrativa — eliminarla.)

- [ ] **Step 2: Verificar que el guard de campeón falla** — `npx vitest run convex/overrides.test.ts` → FAIL en "ya NO finaliza el campeón" (recompute todavía lo escribe).

- [ ] **Step 3: Recortar `recomputeTeamStates`** — en `convex/matches.ts`, borrar el bloque de finalización de campeón (el `// finalize champion → quiniela winners` y su `if (champion) { ... }`). El handler termina tras el `for (const t of teams) { ... patch alive/currentStage ... }`.

- [ ] **Step 4: Recortar `upsertMatchResult`** — en `convex/matches.ts`: borrar la línea `if (existing?.manualOverride) return;` y quitar `manualOverride: existing?.manualOverride ?? false,` del objeto `fields`.

- [ ] **Step 5: Dejar de sembrar `manualOverride`** — en `convex/seed.ts`, quitar la línea `manualOverride: false,` del `insert("matches", {...})`.

- [ ] **Step 6: Relajar el esquema** — en `convex/schema.ts`, cambiar `manualOverride: v.boolean(),` por `manualOverride: v.optional(v.boolean()), // DEPRECADO: las correcciones son por quiniela (matchOverrides); el global sigue la API`.

- [ ] **Step 7: Regenerar y verificar verde** — `npx convex codegen && npx tsc -p claude 2>/dev/null; npx tsc -p convex && npx tsc && npm run lint && npm test` → tsc limpio, lint 0, todos los tests verdes.

- [ ] **Step 8: Commit**

```bash
git add convex/matches.ts convex/seed.ts convex/schema.ts convex/overrides.test.ts convex/_generated
git commit -m "refactor: el estado global vuelve a ser verdad-API pura (campeón/finished derivados por quiniela)"
```

---

## Task 6: UI admin — revertir + selector de ganador

**Files:** Modify `src/routes/Admin.tsx`.

- [ ] **Step 1: Hooks y estado** — tras `const setResult = useMutation(api.matches.setMatchResultManual);` añadir:

```tsx
  const clearOverride = useMutation(api.matches.clearMatchOverride);
```

Y junto a los otros `useState`, el estado del selector de ganador:

```tsx
  const [winners, setWinners] = useState<Record<string, "home" | "draw" | "away">>({});
```

- [ ] **Step 2: Tipar la fila y reescribir `saveScore`** — cambiar la firma a recibir la fila completa. Reemplazar `saveScore`:

```tsx
  type AdminMatch = (typeof data.matches)[number];

  function selectedWinner(m: AdminMatch): "home" | "draw" | "away" {
    return winners[m.externalId]
      ?? (m.winnerExternalId && m.winnerExternalId === m.homeExternalId ? "home"
        : m.winnerExternalId && m.winnerExternalId === m.awayExternalId ? "away" : "draw");
  }

  async function saveScore(m: AdminMatch) {
    const s = scores[m.externalId] ?? {};
    const homeScore = Number(s.h ?? m.homeScore ?? 0);
    const awayScore = Number(s.a ?? m.awayScore ?? 0);
    const isKnockout = m.stage !== "group";
    let winnerExternalId: string | null | undefined = undefined;
    if (isKnockout) {
      const sel = selectedWinner(m);
      winnerExternalId = sel === "home" ? m.homeExternalId : sel === "away" ? m.awayExternalId : null;
    }
    setSavingId(m.externalId);
    try {
      await setResult({ adminToken: token!, matchExternalId: m.externalId, homeScore, awayScore, finished: true, winnerExternalId });
      toast.success("Marcador actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSavingId(null);
    }
  }

  async function revertScore(externalId: string) {
    setSavingId(externalId);
    try {
      await clearOverride({ adminToken: token!, matchExternalId: externalId });
      toast.success("Volvió al resultado automático");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo revertir");
    } finally {
      setSavingId(null);
    }
  }
```

- [ ] **Step 3: JSX — botón revertir + selector KO** — En la tarjeta de cada partido: (a) en la cabecera, junto al badge `m.manualOverride`, añadir el botón revertir; (b) cambiar `onClick={() => void saveScore(m.externalId)}` por `onClick={() => void saveScore(m)}`; (c) bajo la fila de marcador, para eliminatoria, el selector. Reemplazar el contenido del header del card y añadir el selector:

```tsx
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
                    {m.label}
                  </span>
                  {m.manualOverride && (
                    <button
                      type="button"
                      onClick={() => void revertScore(m.externalId)}
                      className="text-[0.65rem] font-semibold text-gold underline-offset-2 hover:underline"
                    >
                      ↺ volver al automático
                    </button>
                  )}
                </div>
```

Y justo tras el `<div className="flex items-center gap-2">…</div>` del marcador (antes de cerrar el card), el selector de ganador para eliminatoria:

```tsx
                {m.stage !== "group" && (
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <span className="text-[0.65rem] font-semibold text-muted-foreground uppercase">Ganador</span>
                    {([
                      ["home", m.homeTeam?.code ?? "Local"],
                      ["draw", "—"],
                      ["away", m.awayTeam?.code ?? "Visita"],
                    ] as const).map(([key, lbl]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setWinners((p) => ({ ...p, [m.externalId]: key }))}
                        className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                          selectedWinner(m) === key
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted/60 text-muted-foreground"
                        }`}
                        aria-pressed={selectedWinner(m) === key}
                        aria-label={`Ganador ${lbl}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}
```

- [ ] **Step 4: Verificar build/lint** — `npm run lint && npm run build` → 0 errores, build verde.

- [ ] **Step 5: Commit**

```bash
git add src/routes/Admin.tsx
git commit -m "feat: panel admin con revertir al automático y selector de ganador en eliminatorias"
```

---

## Task 7: Validación en navegador (Playwright MCP) + revisión CodeRabbit

**Files:** ninguno (verificación). Sólo se commitea si surgen arreglos.

- [ ] **Step 1: Levantar dev** — en terminales de fondo: `npx convex dev` (ya ligado a `coordinated-caribou-264`) y `npm run dev`. Si la BD dev no está sembrada: `npx convex run seed:seedFromSnapshot '{}'`.

- [ ] **Step 2: Escenario de aislamiento en el navegador** — con Playwright MCP:
  1. Crear quiniela A; unir 1–2 participantes; cerrar y repartir.
  2. Crear quiniela B; unir 1–2 participantes; cerrar y repartir.
  3. En el admin de A, corregir un marcador (y elegir ganador si es eliminatoria) → guardar.
  4. Verificar en la vista Mundial/Personal de A que el cambio aparece; en las de B que **no** aparece.
  5. En A, "↺ volver al automático" → el cambio desaparece en A.
  6. Revisar 0 errores de consola (`browser_console_messages`).

- [ ] **Step 3: Revisión CodeRabbit** — `coderabbit review --base-commit <sha-base> --plain` (base = commit en `main` antes de la rama). Procesar hallazgos con `superpowers:receiving-code-review`: verificar cada uno antes de aplicar; arreglar los legítimos; descartar falsos positivos con justificación. Commits atómicos por arreglo.

- [ ] **Step 4: Verificación final** — `npm run lint && npx tsc && npm test && npm run build` → todo verde. Push de la rama.

---

## Self-Review del plan

**Cobertura del spec:**
- §3 enfoque (overrides + derivación) → T1–T5. ✓
- §4 modelo de datos (tabla + relajar campos) → T2, T5. ✓
- §5 derivación pura → T1; helper ctx → T3. ✓
- §6 write path (setMatchResultManual, clearMatchOverride, recompute, upsert) → T4, T5. ✓
- §7 read paths (4 queries) → T3. ✓
- §8 UI (revertir, selector, badge) → T6. ✓
- §9 migración (aditivo + optional, un deploy) → T2, T5 (deploy se hace al finalizar la rama). ✓
- §10 pruebas (puras, aislamiento, campeón, revert, KO, cron, Playwright) → T1, T4, T5, T7. ✓

**Consistencia de tipos/nombres:** `OverrideRow`, `effectiveMatches`, `championTeamId` (T1) usados igual en `perQuiniela.ts` (T3) y mutaciones (T4). `resolveQuiniela` devuelve `effRows/effById/states/championTeamId/overriddenMatchIds/teamRows/teamById/matches` — todos consumidos en T3. `AdminData` extendido (T3) y consumido en `Admin.tsx` (T6: `homeExternalId/awayExternalId/winnerExternalId/stage`). Mutación `clearMatchOverride` (T4) usada en UI (T6). ✓

**Placeholders:** ninguno; todo el código está completo. La línea ilustrativa `const code = …` en T5 se marca para borrar. ✓
