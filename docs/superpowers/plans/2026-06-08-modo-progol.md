# Modo Progol (quiniela de pronósticos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un segundo modo de juego "Progol" donde los jugadores pronostican 1/X/2 por partido (1 punto por acierto, gana el líder), sin límite de jugadores, conservando las pestañas y el premio fijo/por persona.

**Architecture:** Módulo aparte `convex/progol.ts` + lógica pura `convex/lib/progol.ts` + tabla `predictions`, reutilizando `resolveQuiniela`, `prizeView`, pagos, sync/cron, avisos y los componentes base. El modo clásico queda intacto salvo ramas tempranas aditivas. Las rutas leen `quinielas.getMode` y renderizan el subárbol correcto. Todo el puntaje se deriva en lectura.

**Tech Stack:** Convex 1.40, React 19 + Vite, react-router 7, Base UI, Tailwind v4, Vitest (`edge-runtime` para backend con `convex-test`, `jsdom` para front con Testing Library), Playwright.

**Spec:** `docs/superpowers/specs/2026-06-08-modo-progol-design.md`

**Comandos de verificación:**
- Test de un archivo: `npx vitest run <ruta>`
- Suite completa: `npm test`
- Typecheck: `npx tsc -b`
- Lint puntual (evita `.claude/worktrees` de sesiones concurrentes): `npx eslint <archivos cambiados>`

---

### Task 1: Schema (`gameMode` + `predictions`) + tipos base + `gameModeOf`

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/types.ts` (añade dos tipos base)
- Modify: `convex/lib/view.ts` (añade `gameModeOf`)
- Test: `convex/lib/view.test.ts`

- [ ] **Step 1: Añade los tipos base en `convex/types.ts`**

Justo debajo de `export type PrizeMode = ...` (cerca de la línea 12), añade:

```ts
// Modo de juego de una quiniela:
//   clasica → se reparten los 48 equipos; gana el dueño del campeón (default / legacy)
//   progol  → cada jugador pronostica 1/X/2 por partido; gana quien más acierte
export type GameMode = "clasica" | "progol";

// Pronóstico de un partido: local / empate / visitante (1 / X / 2).
export type Pick = "home" | "draw" | "away";
```

- [ ] **Step 2: Añade el campo `gameMode` y la tabla `predictions` en `convex/schema.ts`**

En la definición de `quinielas`, junto a `assignMode` (línea ~50), añade el campo:

```ts
    assignMode: v.optional(v.string()), // "on_join" | "on_reveal"; missing = on_join (legacy)
    gameMode: v.optional(v.string()),   // "clasica" | "progol"; ausente = "clasica" (legacy)
```

Y añade una tabla nueva al final del schema, justo antes del cierre `});` (después de `pushSubscriptions`):

```ts
  // Pronósticos del modo Progol: una fila por (quiniela, participante, partido).
  // `predict` hace upsert (editable hasta el saque). No existe en modo clásico.
  predictions: defineTable({
    quinielaId: v.id("quinielas"),
    participantId: v.id("participants"),
    matchId: v.id("matches"),
    pick: v.union(v.literal("home"), v.literal("draw"), v.literal("away")),
    updatedAt: v.number(),
  })
    .index("by_quiniela_participant", ["quinielaId", "participantId"])
    .index("by_quiniela_match", ["quinielaId", "matchId"]),
```

- [ ] **Step 3: Escribe el test de `gameModeOf` (falla)**

Abre `convex/lib/view.test.ts` y añade al final un bloque:

```ts
import { gameModeOf } from "./view";

describe("gameModeOf", () => {
  it("default a clasica cuando falta el campo (legacy)", () => {
    expect(gameModeOf({})).toBe("clasica");
  });
  it("respeta clasica y progol explícitos", () => {
    expect(gameModeOf({ gameMode: "clasica" })).toBe("clasica");
    expect(gameModeOf({ gameMode: "progol" })).toBe("progol");
  });
  it("trata un valor desconocido como clasica", () => {
    expect(gameModeOf({ gameMode: "otro" })).toBe("clasica");
  });
});
```

Si `view.test.ts` ya importa `describe/it/expect` y otros símbolos arriba, no dupliques esos imports; solo añade `gameModeOf` al import de `"./view"` existente o usa el import mostrado.

- [ ] **Step 4: Corre el test (debe fallar)**

Run: `npx vitest run convex/lib/view.test.ts`
Expected: FAIL — `gameModeOf is not a function` / export no encontrado.

- [ ] **Step 5: Implementa `gameModeOf` en `convex/lib/view.ts`**

Cambia el import de tipos y añade la función junto a `prizeModeOf`:

```ts
import type { TeamLite, PrizeMode, PrizeView, PlayerTeam, GameMode } from "../types";
```

```ts
export function gameModeOf(qn: { gameMode?: string }): GameMode {
  return qn.gameMode === "progol" ? "progol" : "clasica";
}
```

- [ ] **Step 6: Corre el test (debe pasar)**

Run: `npx vitest run convex/lib/view.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck (la tabla nueva regenera tipos de Convex en build)**

Run: `npx tsc -b`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add convex/schema.ts convex/types.ts convex/lib/view.ts convex/lib/view.test.ts
git commit -m "feat(progol): schema gameMode + tabla predictions + gameModeOf

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Lógica pura `convex/lib/progol.ts`

**Files:**
- Create: `convex/lib/progol.ts`
- Test: `convex/lib/progol.test.ts`

- [ ] **Step 1: Escribe los tests (fallan)**

Crea `convex/lib/progol.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  matchResult, isPredictable, matchUiState, leaderboard,
  unlockedKnockoutStages, detectProgolEvents,
} from "./progol";
import type { MatchRow } from "./tournament";

const m = (p: Partial<MatchRow>): MatchRow => ({
  _id: "x", stage: "group", group: "A", homeTeamId: "h", awayTeamId: "a",
  homeScore: null, awayScore: null, status: "scheduled", winnerTeamId: null,
  kickoffAt: 1000, ...p,
});

describe("matchResult", () => {
  it("devuelve home/away/draw por marcador de un partido terminado", () => {
    expect(matchResult(m({ status: "finished", homeScore: 2, awayScore: 1 }))).toBe("home");
    expect(matchResult(m({ status: "finished", homeScore: 0, awayScore: 3 }))).toBe("away");
    expect(matchResult(m({ status: "finished", homeScore: 1, awayScore: 1 }))).toBe("draw");
  });
  it("penales = empate (marcador parejo aunque haya clasificado)", () => {
    expect(matchResult(m({ stage: "r32", status: "finished", homeScore: 1, awayScore: 1, winnerTeamId: "h" }))).toBe("draw");
  });
  it("null si no terminó o falta marcador", () => {
    expect(matchResult(m({ status: "scheduled" }))).toBeNull();
    expect(matchResult(m({ status: "finished", homeScore: null, awayScore: 2 }))).toBeNull();
  });
});

describe("isPredictable / matchUiState", () => {
  it("predecible solo con ambos equipos, scheduled y antes del saque", () => {
    expect(isPredictable(m({ kickoffAt: 2000 }), 1000)).toBe(true);
    expect(isPredictable(m({ kickoffAt: 500 }), 1000)).toBe(false); // ya empezó
    expect(isPredictable(m({ homeTeamId: null }), 1000)).toBe(false); // sin rival
  });
  it("estados UI: pending/predictable/locked/finished", () => {
    expect(matchUiState(m({ homeTeamId: null, awayTeamId: null }), 1000)).toBe("pending");
    expect(matchUiState(m({ kickoffAt: 2000 }), 1000)).toBe("predictable");
    expect(matchUiState(m({ kickoffAt: 500, status: "live" }), 1000)).toBe("locked");
    expect(matchUiState(m({ status: "finished", homeScore: 1, awayScore: 0 }), 1000)).toBe("finished");
  });
});

describe("leaderboard", () => {
  it("puntos = aciertos; played = partidos definidos pronosticados; empates comparten rank", () => {
    const participants = [{ id: "A" }, { id: "B" }, { id: "C" }];
    const results = new Map([["m1", "home"], ["m2", "draw"]] as const);
    const picks = [
      { participantId: "A", matchId: "m1", pick: "home" as const }, // ✓
      { participantId: "A", matchId: "m2", pick: "draw" as const }, // ✓
      { participantId: "B", matchId: "m1", pick: "home" as const }, // ✓
      { participantId: "B", matchId: "m2", pick: "away" as const }, // ✗
      // C no pronosticó nada
    ];
    const rows = leaderboard(participants, picks, results);
    const byId = Object.fromEntries(rows.map((r) => [r.participantId, r]));
    expect(byId["A"].points).toBe(2);
    expect(byId["A"].played).toBe(2);
    expect(byId["B"].points).toBe(1);
    expect(byId["B"].played).toBe(2);
    expect(byId["C"].points).toBe(0);
    expect(byId["C"].played).toBe(0);
    expect(byId["A"].rank).toBe(1);
    expect(byId["B"].rank).toBe(2);
    expect(byId["C"].rank).toBe(3);
  });
  it("dos líderes empatados comparten el rank 1", () => {
    const results = new Map([["m1", "home"]] as const);
    const rows = leaderboard(
      [{ id: "A" }, { id: "B" }],
      [
        { participantId: "A", matchId: "m1", pick: "home" as const },
        { participantId: "B", matchId: "m1", pick: "home" as const },
      ],
      results,
    );
    expect(rows.every((r) => r.rank === 1)).toBe(true);
  });
});

describe("unlockedKnockoutStages", () => {
  it("ignora grupos y lista etapas de eliminatoria con ambos equipos definidos, ordenadas", () => {
    const ms = [
      { stage: "group", homeTeamId: "a", awayTeamId: "b" },
      { stage: "r16", homeTeamId: "a", awayTeamId: "b" },
      { stage: "r32", homeTeamId: "a", awayTeamId: "b" },
      { stage: "qf", homeTeamId: "a", awayTeamId: null }, // sin rival → no cuenta
    ];
    expect(unlockedKnockoutStages(ms)).toEqual(["r32", "r16"]);
  });
});

describe("detectProgolEvents", () => {
  it("emite tournament_started y predictions_unlocked por etapa, con dedupeKey por participante", () => {
    const intents = detectProgolEvents({
      quinielaId: "q1", tournamentStarted: true,
      effMatches: [{ stage: "r32", homeTeamId: "a", awayTeamId: "b" }],
      participants: [{ id: "P1" }, { id: "P2" }],
    });
    const types = intents.map((i) => i.type);
    expect(types.filter((t) => t === "tournament_started")).toHaveLength(2);
    expect(types.filter((t) => t === "predictions_unlocked")).toHaveLength(2);
    expect(intents.find((i) => i.type === "predictions_unlocked" && i.participantId === "P1")!.dedupeKey)
      .toBe("q1:predictions_unlocked:r32:P1");
  });
  it("sin torneo iniciado y sin eliminatorias no emite nada", () => {
    expect(detectProgolEvents({
      quinielaId: "q1", tournamentStarted: false,
      effMatches: [{ stage: "group", homeTeamId: "a", awayTeamId: "b" }],
      participants: [{ id: "P1" }],
    })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Corre el test (debe fallar)**

Run: `npx vitest run convex/lib/progol.test.ts`
Expected: FAIL — no existe `./progol`.

- [ ] **Step 3: Implementa `convex/lib/progol.ts`**

```ts
// convex/lib/progol.ts
import type { MatchRow } from "./tournament";
import type { Pick } from "../types";
import { dedupeKey, type NotifyIntent } from "./notify";

/** Etiquetas de etapa, compartidas con las vistas. */
export const STAGE_LABEL: Record<string, string> = {
  group: "Grupos", r32: "Dieciseisavos", r16: "Octavos", qf: "Cuartos",
  sf: "Semis", third: "3er lugar", final: "Final",
};
const STAGE_ORDER = ["group", "r32", "r16", "qf", "sf", "third", "final"];
export function stageRank(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? STAGE_ORDER.length : i;
}

/** 1/X/2 por marcador efectivo; null si no terminó o falta marcador. */
export function matchResult(
  m: { status: string; homeScore: number | null; awayScore: number | null },
): Pick | null {
  if (m.status !== "finished" || m.homeScore == null || m.awayScore == null) return null;
  if (m.homeScore > m.awayScore) return "home";
  if (m.awayScore > m.homeScore) return "away";
  return "draw";
}

/** ¿Pronosticable AHORA? Ambos equipos definidos, programado y antes del saque. */
export function isPredictable(
  m: { homeTeamId: string | null; awayTeamId: string | null; status: string; kickoffAt: number },
  now: number,
): boolean {
  return !!m.homeTeamId && !!m.awayTeamId && m.status === "scheduled" && now < m.kickoffAt;
}

export type MatchUiState = "pending" | "predictable" | "locked" | "finished";
/** pending = falta rival · predictable = editable · locked = ya empezó sin resultado · finished = terminado. */
export function matchUiState(m: MatchRow, now: number): MatchUiState {
  if (m.status === "finished") return "finished";
  if (!m.homeTeamId || !m.awayTeamId) return "pending";
  return isPredictable(m, now) ? "predictable" : "locked";
}

export type LeaderRow = {
  participantId: string; points: number; correct: number; played: number; rank: number;
};
/** points = correct = aciertos. played = partidos terminados (con resultado) pronosticados.
 *  Orden: points desc, luego participantId asc (determinista). rank por points (empates comparten). */
export function leaderboard(
  participants: { id: string }[],
  picks: { participantId: string; matchId: string; pick: Pick }[],
  results: Map<string, Pick>,
): LeaderRow[] {
  const agg = new Map<string, { correct: number; played: number }>();
  for (const p of participants) agg.set(p.id, { correct: 0, played: 0 });
  for (const pk of picks) {
    const res = results.get(pk.matchId);
    if (res === undefined) continue;
    const a = agg.get(pk.participantId);
    if (!a) continue;
    a.played += 1;
    if (pk.pick === res) a.correct += 1;
  }
  const rows = participants.map((p) => {
    const a = agg.get(p.id)!;
    return { participantId: p.id, points: a.correct, correct: a.correct, played: a.played, rank: 0 };
  });
  rows.sort((x, y) => y.points - x.points || (x.participantId < y.participantId ? -1 : 1));
  let rank = 0; let prev = Number.NaN;
  rows.forEach((r, i) => {
    if (r.points !== prev) { rank = i + 1; prev = r.points; }
    r.rank = rank;
  });
  return rows;
}

/** Etapas de eliminatoria cuyos partidos YA tienen ambos equipos definidos (para avisar). */
export function unlockedKnockoutStages(
  effMatches: { stage: string; homeTeamId: string | null; awayTeamId: string | null }[],
): string[] {
  const stages = new Set<string>();
  for (const mt of effMatches) {
    if (mt.stage !== "group" && mt.homeTeamId && mt.awayTeamId) stages.add(mt.stage);
  }
  return [...stages].sort((a, b) => stageRank(a) - stageRank(b));
}

export type ProgolSyncInput = {
  quinielaId: string;
  tournamentStarted: boolean;
  effMatches: { stage: string; homeTeamId: string | null; awayTeamId: string | null }[];
  participants: { id: string }[];
};
/** Avisos del modo progol: torneo iniciado + etapas de eliminatoria desbloqueadas. */
export function detectProgolEvents(input: ProgolSyncInput): NotifyIntent[] {
  const { quinielaId: q, tournamentStarted, effMatches, participants } = input;
  const out: NotifyIntent[] = [];
  if (tournamentStarted) {
    for (const p of participants) {
      out.push({
        quinielaId: q, audience: "participant", participantId: p.id, type: "tournament_started",
        title: "¡Arrancó el Mundial! ⚽", body: "Pronostica los partidos en tu panel.",
        matchId: null, teamId: null, dedupeKey: dedupeKey(q, "tournament_started", null, p.id),
      });
    }
  }
  for (const stage of unlockedKnockoutStages(effMatches)) {
    const label = STAGE_LABEL[stage] ?? stage;
    for (const p of participants) {
      out.push({
        quinielaId: q, audience: "participant", participantId: p.id, type: "predictions_unlocked",
        title: "¡Nuevos partidos para pronosticar!", body: `Ya puedes pronosticar los ${label}.`,
        matchId: null, teamId: null, dedupeKey: dedupeKey(q, "predictions_unlocked", stage, p.id),
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Corre el test (debe pasar)**

Run: `npx vitest run convex/lib/progol.test.ts`
Expected: PASS (todos los `describe`).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/progol.ts convex/lib/progol.test.ts
git commit -m "feat(progol): lógica pura (resultado, puntaje, desbloqueo, avisos)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Tipos de vista en `convex/types.ts`

**Files:**
- Modify: `convex/types.ts`

- [ ] **Step 1: Extrae `AdminMatchView` y añade los tipos progol**

En `convex/types.ts`, reemplaza el bloque de `AdminData` (su campo `matches` inline) extrayendo el elemento a un tipo nombrado, y añade los tipos progol. Concretamente:

1. Sustituye el campo `matches: { ... }[]` dentro de `AdminData` por `matches: AdminMatchView[];`.
2. Añade, junto a `AdminData`:

```ts
export type AdminMatchView = {
  externalId: string; stage: string; label: string;
  homeTeam: TeamLite | null; awayTeam: TeamLite | null;
  homeExternalId: string | null; awayExternalId: string | null;
  homeScore: number | null; awayScore: number | null;
  status: string; winnerExternalId: string | null; manualOverride: boolean;
};
```

3. Añade los tipos del modo progol (al final del archivo, antes de las definiciones de notificaciones o donde encaje):

```ts
export type ProgolLeaderRow = {
  participantId: string; name: string; photoUrl: string | null;
  points: number; correct: number; played: number; rank: number;
};

export type ProgolGeneralData = {
  mode: "progol";
  quiniela: { name: string; photoUrl: string | null; prize: PrizeView;
              status: "open" | "locked" | "finished"; filledCount: number; notes: string | null };
  leaderboard: ProgolLeaderRow[];
  decidedMatches: number;
  winnerParticipantIds: string[];
};

export type ProgolMatchView = {
  matchId: string; stage: string; label: string;
  home: TeamLite | null; away: TeamLite | null; kickoffAt: number;
  state: "pending" | "predictable" | "locked" | "finished";
  pick: Pick | null;       // pick del DUEÑO de la tarjeta (mío en getPersonal, suyo en getCard)
  result: Pick | null;     // si finished
  correct: boolean | null; // si finished y había pick
  homeScore: number | null; awayScore: number | null;
};

export type ProgolCardData = {
  mode: "progol";
  quinielaId: string; quinielaName: string; joinToken: string; prize: PrizeView;
  status: "open" | "locked" | "finished";
  who: { participantId: string; name: string; photoUrl: string | null;
         points: number; rank: number; correct: number; played: number };
  stages: { stage: string; label: string; matches: ProgolMatchView[] }[];
};

export type ProgolAdminData = {
  quiniela: { name: string; photoUrl: string | null; prize: PrizeView;
              status: "open" | "locked" | "finished"; joinToken: string; notes: string | null;
              filledCount: number; methodCounts: { efectivo: number; transferencia: number } };
  participants: { id: string; name: string; personalToken: string;
                  points: number; played: number; paid: boolean;
                  paymentMethod: "efectivo" | "transferencia" | null }[];
  matches: AdminMatchView[];
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: sin errores (`getAdmin` en `quinielas.ts` ya devuelve estructuralmente `AdminMatchView[]`, así que sigue compilando sin tocarlo).

- [ ] **Step 3: Commit**

```bash
git add convex/types.ts
git commit -m "feat(progol): tipos de vista (leaderboard, tarjeta, admin) + AdminMatchView

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `createQuiniela` rama progol + `quinielas.getMode`

**Files:**
- Modify: `convex/quinielas.ts`
- Test: `convex/quinielas.test.ts`

- [ ] **Step 1: Escribe los tests (fallan)**

Añade a `convex/quinielas.test.ts` (puede ser dentro del `describe("createQuiniela")` y un `describe("getMode")` nuevo):

```ts
describe("createQuiniela progol", () => {
  it("crea una quiniela progol sin reparto ni tope", async () => {
    const t = await seeded();
    const res = await t.mutation(api.quinielas.createQuiniela, {
      name: "Pronos", prizeText: "$5,000", numParticipants: 10, gameMode: "progol",
    });
    const qn = await t.run((ctx) => ctx.db.get(res.quinielaId));
    expect(qn!.gameMode).toBe("progol");
    expect(qn!.numParticipants).toBe(0);     // centinela de "sin límite"
    expect(qn!.slotSizes).toEqual([]);
  });
  it("default a clasica cuando no se pasa gameMode", async () => {
    const t = await seeded();
    const res = await t.mutation(api.quinielas.createQuiniela, { name: "C", prizeText: "$1", numParticipants: 6 });
    const qn = await t.run((ctx) => ctx.db.get(res.quinielaId));
    expect(qn!.gameMode).toBe("clasica");
    expect(qn!.slotSizes.reduce((a: number, b: number) => a + b, 0)).toBe(48);
  });
});

describe("getMode", () => {
  it("devuelve el modo de la quiniela", async () => {
    const t = await seeded();
    const c = await t.mutation(api.quinielas.createQuiniela, { name: "C", prizeText: "$1", numParticipants: 4 });
    const p = await t.mutation(api.quinielas.createQuiniela, { name: "P", prizeText: "$1", numParticipants: 4, gameMode: "progol" });
    expect((await t.query(api.quinielas.getMode, { id: c.quinielaId })).gameMode).toBe("clasica");
    expect((await t.query(api.quinielas.getMode, { id: p.quinielaId })).gameMode).toBe("progol");
  });
});
```

- [ ] **Step 2: Corre el test (debe fallar)**

Run: `npx vitest run convex/quinielas.test.ts`
Expected: FAIL — `gameMode` no se guarda / `getMode` no existe.

- [ ] **Step 3: Implementa la rama en `createQuiniela` y la query `getMode`**

En `convex/quinielas.ts`:

1. Importa el helper (añádelo al import existente de `./lib/view`):

```ts
import { teamLite, photoUrl, prizeView, sortPlayerTeams, gameModeOf } from "./lib/view";
```

y añade `GameMode` al import de tipos:

```ts
import type { OverviewData, PlayerStatus, AdminData, AssignMode, GameMode } from "./types";
```

2. Añade el arg y la rama en `createQuiniela`. Reemplaza el inicio del handler (líneas ~72-94) por:

```ts
  args: {
    name: v.string(),
    prizeText: v.string(),
    numParticipants: v.number(),
    photoId: v.optional(v.id("_storage")),
    assignMode: v.optional(v.string()), // "on_join" | "on_reveal"
    prizeMode: v.optional(v.string()),  // "fixed" | "per_person"
    entryFee: v.optional(v.number()),   // requerido en per_person
    notes: v.optional(v.string()),
    gameMode: v.optional(v.string()),   // "clasica" | "progol"
  },
  handler: async (ctx, args) => {
    const isProgol = args.gameMode === "progol";
    // progol: sin tope (centinela 0) ni reparto de equipos (slotSizes vacío).
    const n = isProgol ? 0 : Math.max(1, Math.min(48, Math.floor(args.numParticipants)));
    const slotSizes = isProgol ? [] : shuffleInPlace(computeSlotSizes(n, 48), Math.random);
    const adminToken = newToken();
    const joinToken = newToken();
    const perPerson = args.prizeMode === "per_person";
    const entryFee = perPerson ? Math.max(1, Math.floor(args.entryFee ?? 0)) : undefined;
    const notes = (args.notes ?? "").trim().slice(0, 1000);
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
      gameMode: isProgol ? "progol" : "clasica",
      photoId: args.photoId,
      notes: notes || undefined,
      createdAt: Date.now(),
    });
    return { quinielaId, adminToken, joinToken };
  },
```

3. Añade la query `getMode` (después de `getAdmin`, al final del archivo):

```ts
export const getMode = query({
  args: { id: v.id("quinielas") },
  handler: async (ctx, args): Promise<{ gameMode: GameMode }> => {
    const qn = await ctx.db.get(args.id);
    if (!qn) throw new Error("Quiniela no encontrada");
    return { gameMode: gameModeOf(qn) };
  },
});
```

- [ ] **Step 4: Corre el test (debe pasar)**

Run: `npx vitest run convex/quinielas.test.ts`
Expected: PASS (incluyendo los tests viejos de createQuiniela/getAdmin/etc.).

- [ ] **Step 5: Commit**

```bash
git add convex/quinielas.ts convex/quinielas.test.ts
git commit -m "feat(progol): createQuiniela rama progol + quinielas.getMode

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `joinQuiniela` rama progol

**Files:**
- Modify: `convex/participants.ts`
- Test: `convex/participants.test.ts`

- [ ] **Step 1: Escribe los tests (fallan)**

Añade a `convex/participants.test.ts` (usa el mismo patrón `seeded()` que el resto del archivo; si no existe ahí, copia el helper de `quinielas.test.ts`):

```ts
describe("joinQuiniela progol", () => {
  it("permite unirse sin tope y no reparte equipos", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "P", prizeText: "$1", numParticipants: 10, gameMode: "progol",
    });
    for (const name of ["A", "B", "C"]) {
      await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name });
    }
    const ps = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(ps).toHaveLength(3);
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(owns).toHaveLength(0); // progol no reparte equipos
  });
  it("rechaza unirse cuando ya cerró la inscripción", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "P", prizeText: "$1", numParticipants: 10, gameMode: "progol",
    });
    await t.run((ctx) => ctx.db.patch(q.quinielaId, { status: "locked" }));
    await expect(
      t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Tarde" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Corre el test (debe fallar)**

Run: `npx vitest run convex/participants.test.ts`
Expected: FAIL — la 1ª prueba truena al unir el 1er jugador porque el tope `numParticipants=0` rechaza (`k >= 0`).

- [ ] **Step 3: Implementa la rama en `joinQuiniela`**

En `convex/participants.ts`, importa el helper:

```ts
import { teamLite, photoUrl, prizeView, gameModeOf } from "./lib/view";
```

Reemplaza el cuerpo de `joinQuiniela` (líneas ~16-55) por:

```ts
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    if (qn.status !== "open") throw new Error("Las inscripciones están cerradas");

    const isProgol = gameModeOf(qn) === "progol";
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const k = participants.length;
    // progol no tiene tope (numParticipants es 0 = sin límite).
    if (!isProgol && k >= qn.numParticipants) throw new Error("Ya no hay lugares disponibles");

    const name = args.name.trim().slice(0, 40);
    if (!name) throw new Error("El nombre no puede estar vacío");
    const personalToken = newToken();
    const participantId = await ctx.db.insert("participants", {
      quinielaId: qn._id, name,
      photoId: args.photoId, personalToken, slotIndex: k, joinedAt: Date.now(),
    });

    // Reparto de equipos: solo modo clásico. progol no reparte (se pronostica).
    // on_reveal: no teams until the admin reveals. on_join (default): draw a slot-sized
    // batch from the still-unowned pool right now.
    let assignedCount = 0;
    if (!isProgol && qn.assignMode !== "on_reveal") {
      const size = qn.slotSizes[k];
      const owned = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      const ownedSet = new Set(owned.map((o) => o.teamId));
      const allTeams = await ctx.db.query("teams").collect();
      const pool = allTeams.filter((tm) => !ownedSet.has(tm._id)).map((tm) => tm._id);
      const { picked } = drawN(pool, size, Math.random);
      for (const teamId of picked) {
        await ctx.db.insert("ownerships", { quinielaId: qn._id, teamId, participantId });
      }
      assignedCount = picked.length;
    }

    // Avisos: al admin (alguien se unió) y, en clásico, al jugador / "ya están todos".
    await insertNotification(ctx, playerJoinedNotice(qn._id, name, participantId));
    if (!isProgol) {
      if (assignedCount > 0) await insertNotification(ctx, teamsAssignedNotice(qn._id, participantId, assignedCount));
      if (k + 1 >= qn.numParticipants) await insertNotification(ctx, readyToDistributeNotice(qn._id));
    }

    return { personalToken };
  },
```

- [ ] **Step 4: Corre el test (debe pasar)**

Run: `npx vitest run convex/participants.test.ts`
Expected: PASS (los tests clásicos de join siguen verdes).

- [ ] **Step 5: Commit**

```bash
git add convex/participants.ts convex/participants.test.ts
git commit -m "feat(progol): joinQuiniela sin tope ni reparto en modo progol

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `progol.predict`

**Files:**
- Create: `convex/progol.ts`
- Test: `convex/progol.test.ts`

- [ ] **Step 1: Escribe los tests (fallan)**

Crea `convex/progol.test.ts`:

```ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

async function seededProgol() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  await t.mutation(internal.seed.seedFromSnapshot, {});
  const q = await t.mutation(api.quinielas.createQuiniela, {
    name: "P", prizeText: "$1", numParticipants: 10, gameMode: "progol",
  });
  return { t, q };
}
/** Un partido de grupo con ambos equipos y saque en el futuro. */
async function futureGroupMatch(t: Awaited<ReturnType<typeof seededProgol>>["t"]) {
  return await t.run(async (ctx) => {
    const ms = await ctx.db.query("matches").withIndex("by_stage_kickoff", (q) => q.eq("stage", "group")).collect();
    const m = ms.find((x) => x.homeTeamId && x.awayTeamId)!;
    await ctx.db.patch(m._id, { kickoffAt: Date.now() + 86_400_000, status: "scheduled" });
    return m._id;
  });
}

describe("progol.predict", () => {
  it("guarda y luego cambia el pronóstico (upsert)", async () => {
    const { t, q } = await seededProgol();
    const { personalToken } = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const matchId = await futureGroupMatch(t);
    await t.mutation(api.progol.predict, { personalToken, matchId, pick: "home" });
    let rows = await t.run((ctx) => ctx.db.query("predictions").withIndex("by_quiniela_match", (x) => x.eq("quinielaId", q.quinielaId).eq("matchId", matchId)).collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].pick).toBe("home");
    await t.mutation(api.progol.predict, { personalToken, matchId, pick: "draw" });
    rows = await t.run((ctx) => ctx.db.query("predictions").withIndex("by_quiniela_match", (x) => x.eq("quinielaId", q.quinielaId).eq("matchId", matchId)).collect());
    expect(rows).toHaveLength(1); // sigue siendo una sola fila
    expect(rows[0].pick).toBe("draw");
  });
  it("rechaza pronosticar un partido que ya empezó", async () => {
    const { t, q } = await seededProgol();
    const { personalToken } = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const matchId = await futureGroupMatch(t);
    await t.run((ctx) => ctx.db.patch(matchId, { kickoffAt: 1 })); // saque en el pasado
    await expect(t.mutation(api.progol.predict, { personalToken, matchId, pick: "home" })).rejects.toThrow();
  });
  it("rechaza un partido sin rivales definidos", async () => {
    const { t, q } = await seededProgol();
    const { personalToken } = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const blankId = await t.run(async (ctx) => {
      const ms = await ctx.db.query("matches").collect();
      return ms.find((m) => !m.homeTeamId || !m.awayTeamId)!._id;
    });
    await expect(t.mutation(api.progol.predict, { personalToken, matchId: blankId, pick: "home" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Corre el test (debe fallar)**

Run: `npx vitest run convex/progol.test.ts`
Expected: FAIL — no existe `convex/progol.ts`.

- [ ] **Step 3: Implementa `convex/progol.ts` con `predict`**

```ts
// convex/progol.ts
import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveQuiniela } from "./lib/perQuiniela";
import { teamLite, photoUrl, prizeView, gameModeOf } from "./lib/view";
import {
  matchResult, matchUiState, leaderboard, stageRank, STAGE_LABEL,
} from "./lib/progol";
import type {
  Pick, ProgolGeneralData, ProgolCardData, ProgolMatchView, ProgolAdminData,
} from "./types";

export const predict = mutation({
  args: {
    personalToken: v.string(),
    matchId: v.id("matches"),
    pick: v.union(v.literal("home"), v.literal("draw"), v.literal("away")),
  },
  handler: async (ctx, args) => {
    const me = await ctx.db.query("participants")
      .withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken)).first();
    if (!me) throw new Error("Jugador no encontrado");
    const qn = await ctx.db.get(me.quinielaId);
    if (!qn) throw new Error("Quiniela no encontrada");
    if (gameModeOf(qn) !== "progol") throw new Error("Esta quiniela no es de pronósticos");
    const match = await ctx.db.get(args.matchId);
    if (!match) throw new Error("Partido no encontrado");
    if (!match.homeTeamId || !match.awayTeamId) throw new Error("Ese partido aún no tiene rivales definidos");
    if (match.status !== "scheduled" || Date.now() >= match.kickoffAt) throw new Error("Ese partido ya cerró");

    const mine = await ctx.db.query("predictions")
      .withIndex("by_quiniela_participant", (q) => q.eq("quinielaId", qn._id).eq("participantId", me._id))
      .collect();
    const row = mine.find((p) => p.matchId === args.matchId);
    if (row) await ctx.db.patch(row._id, { pick: args.pick, updatedAt: Date.now() });
    else await ctx.db.insert("predictions", {
      quinielaId: qn._id, participantId: me._id, matchId: args.matchId, pick: args.pick, updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
```

> Nota: `query`, `QueryCtx`, los helpers de vista y los tipos importados se usan en las Tasks 7-9 (mismo archivo). Si tu linter marca imports sin uso en este commit intermedio, deja el import y se consume en el siguiente task; o añade las queries de las Tasks 7-9 antes de correr el lint del archivo completo.

- [ ] **Step 4: Corre el test (debe pasar)**

Run: `npx vitest run convex/progol.test.ts`
Expected: PASS (los 3 casos de `predict`).

- [ ] **Step 5: Commit**

```bash
git add convex/progol.ts convex/progol.test.ts
git commit -m "feat(progol): mutation predict (upsert, bloqueo al saque)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `progol.getGeneral` (leaderboard)

**Files:**
- Modify: `convex/progol.ts`
- Test: `convex/progol.test.ts`

- [ ] **Step 1: Escribe el test (falla)**

Añade a `convex/progol.test.ts`:

```ts
describe("progol.getGeneral", () => {
  it("ordena el leaderboard por aciertos", async () => {
    const { t, q } = await seededProgol();
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const b = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Beto" });
    const matchId = await futureGroupMatch(t);
    await t.mutation(api.progol.predict, { personalToken: a.personalToken, matchId, pick: "home" });
    await t.mutation(api.progol.predict, { personalToken: b.personalToken, matchId, pick: "away" });
    await t.run((ctx) => ctx.db.patch(matchId, { status: "finished", homeScore: 2, awayScore: 0 }));
    const g = await t.query(api.progol.getGeneral, { joinToken: q.joinToken });
    expect(g.mode).toBe("progol");
    expect(g.decidedMatches).toBe(1);
    const ana = g.leaderboard.find((r) => r.name === "Ana")!;
    const beto = g.leaderboard.find((r) => r.name === "Beto")!;
    expect(ana.points).toBe(1);
    expect(beto.points).toBe(0);
    expect(ana.rank).toBe(1);
    expect(beto.rank).toBe(2);
  });
});
```

- [ ] **Step 2: Corre el test (debe fallar)**

Run: `npx vitest run convex/progol.test.ts`
Expected: FAIL — `getGeneral` no existe.

- [ ] **Step 3: Implementa `getGeneral` en `convex/progol.ts`**

Añade después de `predict`:

```ts
export const getGeneral = query({
  args: { joinToken: v.string() },
  handler: async (ctx, args): Promise<ProgolGeneralData> => {
    const qn = await ctx.db.query("quinielas")
      .withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const { effRows } = await resolveQuiniela(ctx, qn._id);
    const finalDone = effRows.some((mt) => mt.stage === "final" && mt.status === "finished");
    const participants = await ctx.db.query("participants")
      .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const picks = await ctx.db.query("predictions")
      .withIndex("by_quiniela_participant", (q) => q.eq("quinielaId", qn._id)).collect();
    const results = new Map<string, Pick>();
    for (const mt of effRows) { const r = matchResult(mt); if (r) results.set(mt._id, r); }
    const rows = leaderboard(
      participants.map((p) => ({ id: p._id as string })),
      picks.map((pk) => ({ participantId: pk.participantId as string, matchId: pk.matchId as string, pick: pk.pick as Pick })),
      results,
    );
    const pById = new Map(participants.map((p) => [p._id as string, p]));
    const board = await Promise.all(rows.map(async (r) => {
      const p = pById.get(r.participantId)!;
      return {
        participantId: r.participantId, name: p.name, photoUrl: await photoUrl(ctx, p.photoId),
        points: r.points, correct: r.correct, played: r.played, rank: r.rank,
      };
    }));
    const paidCount = participants.filter((p) => p.paid === true).length;
    const status = (finalDone ? "finished" : qn.status) as "open" | "locked" | "finished";
    const winnerParticipantIds = finalDone ? board.filter((b) => b.rank === 1).map((b) => b.participantId) : [];
    return {
      mode: "progol",
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prize: prizeView(qn, paidCount),
        status, filledCount: participants.length, notes: qn.notes ?? null,
      },
      leaderboard: board, decidedMatches: results.size, winnerParticipantIds,
    };
  },
});
```

- [ ] **Step 4: Corre el test (debe pasar)**

Run: `npx vitest run convex/progol.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/progol.ts convex/progol.test.ts
git commit -m "feat(progol): getGeneral (leaderboard derivado)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `progol.getPersonal` + `progol.getCard`

**Files:**
- Modify: `convex/progol.ts`
- Test: `convex/progol.test.ts`

- [ ] **Step 1: Escribe los tests (fallan)**

Añade a `convex/progol.test.ts`:

```ts
describe("progol.getPersonal / getCard", () => {
  it("expone el estado por partido, mi pick y el acierto", async () => {
    const { t, q } = await seededProgol();
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const matchId = await futureGroupMatch(t);
    await t.mutation(api.progol.predict, { personalToken: a.personalToken, matchId, pick: "home" });
    await t.run((ctx) => ctx.db.patch(matchId, { status: "finished", homeScore: 1, awayScore: 0 }));
    const card = await t.query(api.progol.getPersonal, { personalToken: a.personalToken });
    const mine = card.stages.flatMap((s) => s.matches).find((m) => m.matchId === matchId)!;
    expect(mine.state).toBe("finished");
    expect(mine.pick).toBe("home");
    expect(mine.result).toBe("home");
    expect(mine.correct).toBe(true);
    expect(card.who.points).toBe(1);
  });
  it("getCard muestra la tarjeta de otro jugador (read-only)", async () => {
    const { t, q } = await seededProgol();
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const matchId = await futureGroupMatch(t);
    await t.mutation(api.progol.predict, { personalToken: a.personalToken, matchId, pick: "draw" });
    const aId = await t.run(async (ctx) => {
      const ps = await ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect();
      return ps[0]._id;
    });
    const card = await t.query(api.progol.getCard, { joinToken: q.joinToken, participantId: aId });
    expect(card.who.name).toBe("Ana");
    const mine = card.stages.flatMap((s) => s.matches).find((m) => m.matchId === matchId)!;
    expect(mine.pick).toBe("draw");
  });
});
```

- [ ] **Step 2: Corre el test (debe fallar)**

Run: `npx vitest run convex/progol.test.ts`
Expected: FAIL — `getPersonal`/`getCard` no existen.

- [ ] **Step 3: Implementa el helper `buildCard` + `getPersonal` + `getCard`**

Añade a `convex/progol.ts`:

```ts
/** Construye la tarjeta de pronósticos de un participante (mía en getPersonal, ajena en getCard). */
async function buildCard(ctx: QueryCtx, qn: Doc<"quinielas">, who: Doc<"participants">): Promise<ProgolCardData> {
  const { teamById, effRows } = await resolveQuiniela(ctx, qn._id);
  const participants = await ctx.db.query("participants")
    .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
  const picks = await ctx.db.query("predictions")
    .withIndex("by_quiniela_participant", (q) => q.eq("quinielaId", qn._id)).collect();
  const results = new Map<string, Pick>();
  for (const mt of effRows) { const r = matchResult(mt); if (r) results.set(mt._id, r); }
  const rows = leaderboard(
    participants.map((p) => ({ id: p._id as string })),
    picks.map((pk) => ({ participantId: pk.participantId as string, matchId: pk.matchId as string, pick: pk.pick as Pick })),
    results,
  );
  const myRow = rows.find((r) => r.participantId === (who._id as string))!;
  const myPickByMatch = new Map<string, Pick>();
  for (const pk of picks) if (pk.participantId === who._id) myPickByMatch.set(pk.matchId as string, pk.pick as Pick);

  const now = Date.now();
  const finalDone = effRows.some((mt) => mt.stage === "final" && mt.status === "finished");
  const byStage = new Map<string, ProgolMatchView[]>();
  for (const mt of [...effRows].sort((a, b) => a.kickoffAt - b.kickoffAt)) {
    const result = matchResult(mt);
    const pick = myPickByMatch.get(mt._id) ?? null;
    const view: ProgolMatchView = {
      matchId: mt._id, stage: mt.stage, label: STAGE_LABEL[mt.stage] ?? mt.stage,
      home: mt.homeTeamId ? teamLite(teamById.get(mt.homeTeamId as Id<"teams">)) : null,
      away: mt.awayTeamId ? teamLite(teamById.get(mt.awayTeamId as Id<"teams">)) : null,
      kickoffAt: mt.kickoffAt, state: matchUiState(mt, now),
      pick, result, correct: result ? (pick != null ? pick === result : null) : null,
      homeScore: mt.homeScore, awayScore: mt.awayScore,
    };
    if (!byStage.has(mt.stage)) byStage.set(mt.stage, []);
    byStage.get(mt.stage)!.push(view);
  }
  const stages = [...byStage.entries()]
    .sort((a, b) => stageRank(a[0]) - stageRank(b[0]))
    .map(([stage, matches]) => ({ stage, label: STAGE_LABEL[stage] ?? stage, matches }));
  const paidCount = participants.filter((p) => p.paid === true).length;
  return {
    mode: "progol",
    quinielaId: qn._id as string, quinielaName: qn.name, joinToken: qn.joinToken,
    prize: prizeView(qn, paidCount),
    status: (finalDone ? "finished" : qn.status) as "open" | "locked" | "finished",
    who: {
      participantId: who._id as string, name: who.name, photoUrl: await photoUrl(ctx, who.photoId),
      points: myRow.points, rank: myRow.rank, correct: myRow.correct, played: myRow.played,
    },
    stages,
  };
}

export const getPersonal = query({
  args: { personalToken: v.string() },
  handler: async (ctx, args): Promise<ProgolCardData> => {
    const me = await ctx.db.query("participants")
      .withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken)).first();
    if (!me) throw new Error("Jugador no encontrado");
    const qn = await ctx.db.get(me.quinielaId);
    if (!qn) throw new Error("Quiniela no encontrada");
    return buildCard(ctx, qn, me);
  },
});

export const getCard = query({
  args: { joinToken: v.string(), participantId: v.id("participants") },
  handler: async (ctx, args): Promise<ProgolCardData> => {
    const qn = await ctx.db.query("quinielas")
      .withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const who = await ctx.db.get(args.participantId);
    if (!who || who.quinielaId !== qn._id) throw new Error("Jugador no encontrado");
    return buildCard(ctx, qn, who);
  },
});
```

- [ ] **Step 4: Corre el test (debe pasar)**

Run: `npx vitest run convex/progol.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/progol.ts convex/progol.test.ts
git commit -m "feat(progol): getPersonal + getCard (mis pronósticos y ver a otros)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `progol.getAdmin` + `progol.closeRegistration`

**Files:**
- Modify: `convex/progol.ts`
- Test: `convex/progol.test.ts`

- [ ] **Step 1: Escribe los tests (fallan)**

Añade a `convex/progol.test.ts`:

```ts
describe("progol.getAdmin / closeRegistration", () => {
  it("lista participantes con puntos y expone los 104 partidos", async () => {
    const { t, q } = await seededProgol();
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const admin = await t.query(api.progol.getAdmin, { adminToken: q.adminToken });
    expect(admin.participants).toHaveLength(1);
    expect(admin.participants[0].points).toBe(0);
    expect(admin.matches.length).toBe(104);
    expect(admin.quiniela.joinToken).toBe(q.joinToken);
  });
  it("closeRegistration cierra la inscripción", async () => {
    const { t, q } = await seededProgol();
    await t.mutation(api.progol.closeRegistration, { adminToken: q.adminToken });
    const qn = await t.run((ctx) => ctx.db.get(q.quinielaId));
    expect(qn!.status).toBe("locked");
  });
});
```

- [ ] **Step 2: Corre el test (debe fallar)**

Run: `npx vitest run convex/progol.test.ts`
Expected: FAIL — `getAdmin`/`closeRegistration` no existen.

- [ ] **Step 3: Implementa `getAdmin` + `closeRegistration`**

Añade a `convex/progol.ts` (el mapeo de partidos es el mismo de `quinielas.getAdmin`; se duplica a propósito para no tocar el camino clásico):

```ts
export const getAdmin = query({
  args: { adminToken: v.string() },
  handler: async (ctx, args): Promise<ProgolAdminData> => {
    const qn = await ctx.db.query("quinielas")
      .withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const { teamById, effById, effRows, overriddenMatchIds, matches } = await resolveQuiniela(ctx, qn._id);
    const participants = await ctx.db.query("participants")
      .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const picks = await ctx.db.query("predictions")
      .withIndex("by_quiniela_participant", (q) => q.eq("quinielaId", qn._id)).collect();
    const results = new Map<string, Pick>();
    for (const mt of effRows) { const r = matchResult(mt); if (r) results.set(mt._id, r); }
    const rows = leaderboard(
      participants.map((p) => ({ id: p._id as string })),
      picks.map((pk) => ({ participantId: pk.participantId as string, matchId: pk.matchId as string, pick: pk.pick as Pick })),
      results,
    );
    const rowById = new Map(rows.map((r) => [r.participantId, r]));
    const paidCount = participants.filter((p) => p.paid === true).length;
    const efectivoCount = participants.filter((p) => p.paymentMethod === "efectivo").length;
    const transferenciaCount = participants.filter((p) => p.paymentMethod === "transferencia").length;
    const finalDone = effRows.some((mt) => mt.stage === "final" && mt.status === "finished");
    const sorted = [...matches].sort((a, b) => a.kickoffAt - b.kickoffAt);
    return {
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prize: prizeView(qn, paidCount),
        status: (finalDone ? "finished" : qn.status) as "open" | "locked" | "finished",
        joinToken: qn.joinToken, notes: qn.notes ?? null, filledCount: participants.length,
        methodCounts: { efectivo: efectivoCount, transferencia: transferenciaCount },
      },
      participants: participants.map((p) => {
        const r = rowById.get(p._id as string)!;
        return {
          id: p._id as string, name: p.name, personalToken: p.personalToken,
          points: r.points, played: r.played, paid: p.paid === true, paymentMethod: p.paymentMethod ?? null,
        };
      }),
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
          winnerExternalId: winner?.externalId ?? null, manualOverride: overriddenMatchIds.has(mt._id as string),
        };
      }),
    };
  },
});

export const closeRegistration = mutation({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas")
      .withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    if (gameModeOf(qn) !== "progol") throw new Error("Solo aplica a quinielas de pronósticos");
    if (qn.status === "open") await ctx.db.patch(qn._id, { status: "locked", lockedAt: Date.now() });
    return { ok: true as const };
  },
});
```

- [ ] **Step 4: Corre el test (debe pasar) + typecheck**

Run: `npx vitest run convex/progol.test.ts && npx tsc -b`
Expected: PASS y sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add convex/progol.ts convex/progol.test.ts
git commit -m "feat(progol): getAdmin + closeRegistration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Cierre de inscripción (`autoCloseDue`) + avisos (`detectFromSync`)

**Files:**
- Modify: `convex/quinielas.ts` (rama progol en `autoCloseDue`)
- Modify: `convex/notifications.ts` (rama progol en `detectFromSync`)
- Test: `convex/progol.test.ts`

- [ ] **Step 1: Escribe los tests (fallan)**

Añade a `convex/progol.test.ts`:

```ts
describe("autoCloseDue + detectFromSync (progol)", () => {
  it("autoCloseDue cierra la inscripción de progol al primer saque", async () => {
    const { t, q } = await seededProgol();
    const first = await t.run((ctx) => ctx.db.query("matches").withIndex("by_kickoff").first());
    await t.run((ctx) => ctx.db.patch(first!._id, { kickoffAt: 1 }));
    await t.mutation(internal.quinielas.autoCloseDue, {});
    const qn = await t.run((ctx) => ctx.db.get(q.quinielaId));
    expect(qn!.status).toBe("locked");
  });
  it("detectFromSync avisa partidos desbloqueados (una sola vez)", async () => {
    const { t, q } = await seededProgol();
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.run(async (ctx) => {
      const teams = await ctx.db.query("teams").take(2);
      const r32 = (await ctx.db.query("matches").collect()).find((m) => m.stage === "r32")!;
      await ctx.db.patch(r32._id, { homeTeamId: teams[0]._id, awayTeamId: teams[1]._id });
    });
    const meId = await t.run(async (ctx) => {
      const ps = await ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect();
      return ps[0]._id;
    });
    await t.mutation(internal.notifications.detectFromSync, {});
    let unlocked = await t.run((ctx) => ctx.db.query("notifications").withIndex("by_participant", (x) => x.eq("participantId", meId)).collect());
    expect(unlocked.filter((n) => n.type === "predictions_unlocked")).toHaveLength(1);
    await t.mutation(internal.notifications.detectFromSync, {});
    unlocked = await t.run((ctx) => ctx.db.query("notifications").withIndex("by_participant", (x) => x.eq("participantId", meId)).collect());
    expect(unlocked.filter((n) => n.type === "predictions_unlocked")).toHaveLength(1); // dedupe
  });
});
```

- [ ] **Step 2: Corre el test (debe fallar)**

Run: `npx vitest run convex/progol.test.ts`
Expected: FAIL — el progol no se cierra / no hay aviso `predictions_unlocked`.

- [ ] **Step 3: Rama progol en `autoCloseDue` (`convex/quinielas.ts`)**

Dentro del `for (const qn of open)` de `autoCloseDue`, añade el branch al inicio del cuerpo del for (antes del check `modeOf(qn) === "on_reveal"`):

```ts
    for (const qn of open) {
      if (gameModeOf(qn) === "progol") {
        // progol no reparte equipos; al arrancar el torneo solo cierra la inscripción.
        await ctx.db.patch(qn._id, { status: "locked", lockedAt: Date.now() });
        continue;
      }
      if (modeOf(qn) === "on_reveal") continue; // reveal is manual-only; never auto-distribute
      const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      if (participants.length === 0) continue; // leave empty quinielas open
      await redistributeAndLock(ctx, qn, participants);
    }
```

(`gameModeOf` ya está importado en `quinielas.ts` desde la Task 4.)

- [ ] **Step 4: Rama progol en `detectFromSync` (`convex/notifications.ts`)**

Añade imports arriba del archivo:

```ts
import { detectProgolEvents } from "./lib/progol";
import { gameModeOf } from "./lib/view";
```

Dentro de `detectFromSync`, añade el branch progol al inicio del `for (const qn of quinielas)` (antes de leer `ownerships`):

```ts
    for (const qn of quinielas) {
      if (gameModeOf(qn) === "progol") {
        const participants = await ctx.db.query("participants")
          .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
        if (participants.length === 0) continue;
        const { effRows } = await resolveQuiniela(ctx, qn._id);
        const intents = detectProgolEvents({
          quinielaId: qn._id as string, tournamentStarted,
          effMatches: effRows.map((m) => ({ stage: m.stage, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId })),
          participants: participants.map((p) => ({ id: p._id as string })),
        });
        for (const intent of intents) await insertNotification(ctx, intent);
        continue;
      }
      const ownerships = await ctx.db.query("ownerships")
        .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      if (ownerships.length === 0) continue; // sin equipos repartidos no hay nada que avisar
      // ... resto del camino clásico SIN CAMBIOS ...
```

> Deja intacto todo lo que sigue del bloque clásico (el `resolveQuiniela`, `detectSyncEvents`, etc.). Solo se inserta el branch progol + `continue` antes de la lectura de `ownerships`.

- [ ] **Step 5: Corre el test (debe pasar)**

Run: `npx vitest run convex/progol.test.ts convex/quinielas.test.ts convex/notifications.test.ts`
Expected: PASS (incluye los tests clásicos de autoCloseDue/notifications sin cambios).

- [ ] **Step 6: Commit**

```bash
git add convex/quinielas.ts convex/notifications.ts convex/progol.test.ts
git commit -m "feat(progol): cierra inscripción al saque + avisa partidos desbloqueados

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Mundial sin caras de dueño en progol

**Files:**
- Modify: `convex/mundial.ts`
- Modify: `convex/types.ts` (`MundialData` + `showOwners`)
- Modify: `src/components/GroupsView.tsx`
- Modify: `src/components/BracketView.tsx`
- Modify: `src/routes/Mundial.tsx`
- Test: `convex/mundial.test.ts`, `src/components/GroupsView.test.tsx`

- [ ] **Step 1: Escribe los tests (fallan)**

En `convex/mundial.test.ts` añade (reutiliza el harness `convexTest`/`seed` ya presente en el archivo):

```ts
it("showOwners=false en progol y true en clásica", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
  await t.mutation(internal.seed.seedFromSnapshot, {});
  const c = await t.mutation(api.quinielas.createQuiniela, { name: "C", prizeText: "$1", numParticipants: 2 });
  const p = await t.mutation(api.quinielas.createQuiniela, { name: "P", prizeText: "$1", numParticipants: 2, gameMode: "progol" });
  expect((await t.query(api.mundial.getMundial, { quinielaId: c.quinielaId })).showOwners).toBe(true);
  expect((await t.query(api.mundial.getMundial, { quinielaId: p.quinielaId })).showOwners).toBe(false);
});
```

Crea `src/components/GroupsView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GroupsView } from "./GroupsView";

const groups = [{
  group: "A",
  rows: [{ team: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" }, points: 3, gd: 1, gf: 2, ownerName: "Ana", ownerPhotoUrl: null, alive: true }],
}];

describe("GroupsView showOwners", () => {
  it("oculta el nombre del dueño cuando showOwners es false", () => {
    const { rerender } = render(<GroupsView groups={groups} showOwners={false} />);
    expect(screen.queryByText("Ana")).toBeNull();
    rerender(<GroupsView groups={groups} showOwners />);
    expect(screen.getByText("Ana")).toBeDefined();
  });
});
```

- [ ] **Step 2: Corre los tests (deben fallar)**

Run: `npx vitest run convex/mundial.test.ts src/components/GroupsView.test.tsx`
Expected: FAIL — `showOwners` no existe en el retorno ni como prop.

- [ ] **Step 3: `MundialData` + `getMundial` devuelven `showOwners`**

En `convex/types.ts`, dentro de `MundialData`, añade el campo:

```ts
export type MundialData = {
  showOwners: boolean;
  groups: { group: string; /* ...sin cambios... */ }[];
  bracket: { /* ...sin cambios... */ }[];
};
```

En `convex/mundial.ts`, importa el helper y devuélvelo:

```ts
import { gameModeOf } from "./lib/view";
```

Al final del handler, antes del `return`, calcula `showOwners` y añádelo al objeto retornado:

```ts
    const qn = await ctx.db.get(quinielaId);
    const showOwners = qn ? gameModeOf(qn) === "clasica" : true;
    return { showOwners, groups, bracket };
```

- [ ] **Step 4: `showOwners` en `GroupsView` y `BracketView`**

En `src/components/GroupsView.tsx`, cambia la firma y envuelve el bloque de dueño:

```tsx
export function GroupsView({ groups, showOwners = true }: { groups: MundialData["groups"]; showOwners?: boolean }) {
```

Sustituye el `<Avatar ... />` + `<span>{r.ownerName}</span>` por:

```tsx
                  {showOwners && (
                    <>
                      <Avatar name={r.ownerName} url={r.ownerPhotoUrl} size={18} />
                      <span className="max-w-16 truncate text-[0.7rem] text-muted-foreground">
                        {r.ownerName}
                      </span>
                    </>
                  )}
```

En `src/components/BracketView.tsx`, propaga `showOwners`:

1. Firma: `export function BracketView({ bracket, showOwners = true }: { bracket: MundialData["bracket"]; showOwners?: boolean })`.
2. `MatchCard`: `function MatchCard({ m, isFinal, showOwners }: { m: BracketMatch; isFinal: boolean; showOwners: boolean })`, y pásalo a `<SideRow side={m.home} win={homeWin} showOwners={showOwners} />` (igual para `m.away`).
3. En el `.map` de matches: `<MatchCard key={i} m={m} isFinal={isFinal} showOwners={showOwners} />`.
4. `SideRow`: `function SideRow({ side, win, showOwners }: { side: Side; win: boolean; showOwners: boolean })`, y envuelve el dueño:

```tsx
        {showOwners && (
          <span className="truncate text-[0.65rem] text-muted-foreground">
            · {side.owner}
          </span>
        )}
```

- [ ] **Step 5: `Mundial.tsx` pasa `showOwners`**

En `src/routes/Mundial.tsx`, pasa la bandera a ambas vistas:

```tsx
        <TabsContent value="grupos" className="mt-4">
          <GroupsView groups={data.groups} showOwners={data.showOwners} />
        </TabsContent>
        <TabsContent value="bracket" className="mt-4">
          <BracketView bracket={data.bracket} showOwners={data.showOwners} />
        </TabsContent>
```

- [ ] **Step 6: Corre los tests (deben pasar) + typecheck**

Run: `npx vitest run convex/mundial.test.ts src/components/GroupsView.test.tsx && npx tsc -b`
Expected: PASS y sin errores.

- [ ] **Step 7: Commit**

```bash
git add convex/mundial.ts convex/types.ts src/components/GroupsView.tsx src/components/BracketView.tsx src/routes/Mundial.tsx convex/mundial.test.ts src/components/GroupsView.test.tsx
git commit -m "feat(progol): Mundial oculta caras de dueño en modo progol

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Selector de modo en `Home.tsx`

**Files:**
- Modify: `src/routes/Home.tsx`

- [ ] **Step 1: Añade el estado `gameMode`**

En `src/routes/Home.tsx`, junto a los demás `useState`, añade:

```tsx
  const [prizeMode, setPrizeMode] = useState<"fixed" | "per_person">("fixed");
  const [fee, setFee] = useState(200);
  const [gameMode, setGameMode] = useState<"clasica" | "progol">("clasica");
  const [busy, setBusy] = useState(false);
```

- [ ] **Step 2: Envía `gameMode` en `submit`**

En la llamada `create({ ... })`, añade `gameMode,` al final de los argumentos:

```tsx
      const res = await create({
        name,
        prizeText: prizeMode === "per_person" ? "" : prize,
        numParticipants: n,
        photoId: photoId as Id<"_storage"> | undefined,
        assignMode,
        prizeMode,
        entryFee: prizeMode === "per_person" ? fee : undefined,
        notes,
        gameMode,
      });
```

- [ ] **Step 3: Inserta el selector de modo como primer campo del formulario**

Justo después de la apertura `<form ...>` y antes del `<div>` que contiene `<Label htmlFor="name">`, inserta:

```tsx
          <div className="flex flex-col gap-2">
            <Label>Modo de juego</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: "clasica", title: "Clásica", sub: "Se reparten los 48 equipos; gana el dueño del campeón." },
                  { v: "progol", title: "Progol 🎯", sub: "Cada quien pronostica 1/X/2 por partido; gana quien más acierte." },
                ] as const
              ).map((o) => {
                const active = gameMode === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setGameMode(o.v)}
                    aria-pressed={active}
                    className={
                      "rounded-2xl border px-3 py-2.5 text-left transition-colors " +
                      (active
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30")
                    }
                  >
                    <div className="text-sm font-bold text-foreground">{o.title}</div>
                    <div className="mt-0.5 text-[0.7rem] leading-snug">{o.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
```

- [ ] **Step 4: Oculta "Número de participantes" y "Reparto de equipos" en progol**

Envuelve los dos bloques `<div className="flex flex-col gap-2">` que contienen, respectivamente, `<Label htmlFor="n">` ("Número/Máximo de participantes") y `<Label>Reparto de equipos</Label>`, en un solo condicional. Es decir:
- Justo antes del `<div>` que abre el bloque de participantes, añade `{gameMode === "clasica" && (<>`.
- Justo después del `</div>` que cierra el bloque de "Reparto de equipos", añade `</>)}`.

Ambos bloques quedan envueltos en `{gameMode === "clasica" && (<> … </>)}`. (En progol no hay tope ni reparto; el backend usa `numParticipants: 0` y `slotSizes: []`.)

- [ ] **Step 5: Typecheck + arranca el dev y verifica visualmente**

Run: `npx tsc -b`
Expected: sin errores. Al alternar "Progol" en el formulario, desaparecen los campos de participantes/reparto y "Premio" + "Notas" permanecen.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Home.tsx
git commit -m "feat(progol): selector de modo de juego en creación

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Componentes hoja `PickSelector` · `PredictMatchRow` · `Leaderboard`

**Files:**
- Create: `src/components/PickSelector.tsx`, `src/components/PredictMatchRow.tsx`, `src/components/Leaderboard.tsx`
- Test: `src/components/PickSelector.test.tsx`, `src/components/PredictMatchRow.test.tsx`, `src/components/Leaderboard.test.tsx`

- [ ] **Step 1: Escribe los tests (fallan)**

`src/components/PickSelector.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PickSelector } from "./PickSelector";

describe("PickSelector", () => {
  it("marca el pick activo y dispara onPick", () => {
    const onPick = vi.fn();
    render(<PickSelector value="home" onPick={onPick} options={{ home: "MEX", away: "BRA" }} />);
    expect(screen.getByRole("button", { name: "Pronóstico MEX" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Pronóstico Empate" }));
    expect(onPick).toHaveBeenCalledWith("draw");
  });
  it("deshabilita todos los botones cuando disabled", () => {
    render(<PickSelector value={null} onPick={() => {}} disabled options={{ home: "MEX", away: "BRA" }} />);
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
  });
});
```

`src/components/PredictMatchRow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PredictMatchRow } from "./PredictMatchRow";
import type { ProgolMatchView } from "@/../convex/types";

const base: ProgolMatchView = {
  matchId: "m1", stage: "group", label: "Grupos",
  home: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" },
  away: { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "A" },
  kickoffAt: 2000, state: "predictable", pick: null, result: null, correct: null,
  homeScore: null, awayScore: null,
};

describe("PredictMatchRow", () => {
  it("muestra el acierto cuando el partido terminó", () => {
    render(<PredictMatchRow editable={false} m={{ ...base, state: "finished", pick: "home", result: "home", correct: true, homeScore: 2, awayScore: 0 }} />);
    expect(screen.getByText(/Acertaste/)).toBeDefined();
  });
  it("muestra 'Rival por definir' cuando está pendiente", () => {
    render(<PredictMatchRow editable m={{ ...base, home: null, away: null, state: "pending" }} />);
    expect(screen.getByText("Rival por definir")).toBeDefined();
  });
});
```

`src/components/Leaderboard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Leaderboard } from "./Leaderboard";

const rows = [
  { participantId: "A", name: "Ana", photoUrl: null, points: 3, correct: 3, played: 5, rank: 1 },
  { participantId: "B", name: "Beto", photoUrl: null, points: 1, correct: 1, played: 5, rank: 2 },
];

describe("Leaderboard", () => {
  it("muestra puntos y dispara onSelect al tocar una fila", () => {
    const onSelect = vi.fn();
    render(<Leaderboard rows={rows} onSelect={onSelect} />);
    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    fireEvent.click(screen.getByText("Beto"));
    expect(onSelect).toHaveBeenCalledWith("B");
  });
});
```

- [ ] **Step 2: Corre los tests (deben fallar)**

Run: `npx vitest run src/components/PickSelector.test.tsx src/components/PredictMatchRow.test.tsx src/components/Leaderboard.test.tsx`
Expected: FAIL — los componentes no existen.

- [ ] **Step 3: Implementa `src/components/PickSelector.tsx`**

```tsx
import type { Pick } from "@/../convex/types";
import { cn } from "@/lib/utils";

/** Control segmentado 1/X/2 (mismo patrón que el "Ganador" del admin clásico). */
export function PickSelector({
  value, onPick, disabled, options,
}: {
  value: Pick | null;
  onPick: (p: Pick) => void;
  disabled?: boolean;
  options: { home: string; away: string };
}) {
  const items: [Pick, string][] = [["home", options.home], ["draw", "Empate"], ["away", options.away]];
  return (
    <div className="flex items-center gap-1.5">
      {items.map(([key, lbl]) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onPick(key)}
            aria-pressed={active}
            aria-label={`Pronóstico ${lbl}`}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition disabled:opacity-60",
              active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implementa `src/components/PredictMatchRow.tsx`**

```tsx
import type { ProgolMatchView, Pick } from "@/../convex/types";
import { PickSelector } from "@/components/PickSelector";
import { whenLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const PICK_LABEL: Record<Pick, string> = { home: "Local", draw: "Empate", away: "Visita" };

/** Una fila de partido: marcador/fecha arriba y el control/resultado abajo según el estado. */
export function PredictMatchRow({
  m, editable, onPick,
}: {
  m: ProgolMatchView;
  editable: boolean;
  onPick?: (matchId: string, pick: Pick) => void;
}) {
  const homeCode = m.home?.code ?? "—";
  const awayCode = m.away?.code ?? "—";
  return (
    <div className="grain relative overflow-hidden rounded-2xl border border-border bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="text-lg leading-none">{m.home?.flag ?? "❔"}</span>
          <span className="truncate text-sm font-medium">{homeCode}</span>
        </span>
        {m.state === "finished" ? (
          <span className="font-heading text-sm font-bold tabular-nums">{m.homeScore}–{m.awayScore}</span>
        ) : (
          <span className="text-[0.65rem] text-muted-foreground">{whenLabel(m.kickoffAt)}</span>
        )}
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
          <span className="truncate text-sm font-medium">{awayCode}</span>
          <span className="text-lg leading-none">{m.away?.flag ?? "❔"}</span>
        </span>
      </div>

      <div className="mt-2.5">
        {m.state === "pending" ? (
          <p className="text-center text-[0.7rem] text-muted-foreground italic">Rival por definir</p>
        ) : m.state === "finished" ? (
          <ResultLine m={m} />
        ) : (
          <PickSelector
            value={m.pick}
            disabled={!editable || m.state === "locked"}
            onPick={(p) => onPick?.(m.matchId, p)}
            options={{ home: homeCode, away: awayCode }}
          />
        )}
        {m.state === "locked" && (
          <p className="mt-1 text-center text-[0.65rem] text-muted-foreground">
            {m.pick ? `Tu pronóstico: ${PICK_LABEL[m.pick]}` : "Sin pronóstico · partido cerrado"}
          </p>
        )}
      </div>
    </div>
  );
}

function ResultLine({ m }: { m: ProgolMatchView }) {
  if (m.pick == null) {
    return <p className="text-center text-[0.7rem] text-muted-foreground">No pronosticaste · resultado: {PICK_LABEL[m.result!]}</p>;
  }
  return (
    <p className={cn("text-center text-[0.7rem] font-semibold", m.correct ? "text-alive" : "text-eliminated")}>
      {m.correct ? "✓ Acertaste" : "✗ Fallaste"} · tu {PICK_LABEL[m.pick]}
    </p>
  );
}
```

- [ ] **Step 5: Implementa `src/components/Leaderboard.tsx`**

```tsx
import type { ProgolLeaderRow } from "@/../convex/types";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";

/** Tabla de posiciones del modo progol. Tocar una fila abre la tarjeta del jugador. */
export function Leaderboard({
  rows, onSelect,
}: {
  rows: ProgolLeaderRow[];
  onSelect?: (participantId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
        Aún no hay jugadores.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <button
          key={r.participantId}
          type="button"
          onClick={() => onSelect?.(r.participantId)}
          className="grain relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/40"
        >
          <span className={cn("w-6 shrink-0 text-center font-heading text-sm font-bold tabular-nums", r.rank === 1 ? "text-gold" : "text-muted-foreground")}>
            {r.rank}
          </span>
          <Avatar name={r.name} url={r.photoUrl} size={34} />
          <span className="min-w-0 flex-1 truncate font-heading text-sm font-semibold">{r.name}</span>
          <span className="shrink-0 text-right">
            <span className="font-heading text-base font-bold tabular-nums text-foreground">{r.points}</span>
            <span className="ml-1 text-[0.7rem] text-muted-foreground">pts</span>
            <span className="block text-[0.65rem] text-muted-foreground">{r.correct}/{r.played} aciertos</span>
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Corre los tests (deben pasar)**

Run: `npx vitest run src/components/PickSelector.test.tsx src/components/PredictMatchRow.test.tsx src/components/Leaderboard.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/PickSelector.tsx src/components/PredictMatchRow.tsx src/components/Leaderboard.tsx src/components/PickSelector.test.tsx src/components/PredictMatchRow.test.tsx src/components/Leaderboard.test.tsx
git commit -m "feat(progol): componentes PickSelector, PredictMatchRow y Leaderboard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Extrae `MatchScoreEditor` (corrección de marcador reutilizable)

Extrae el editor de marcador del admin clásico a un componente **presentacional** (sin hooks de Convex) para que tanto el admin clásico como el de progol lo reutilicen y sea testeable.

**Files:**
- Create: `src/components/MatchScoreEditor.tsx`
- Modify: `src/routes/Admin.tsx`
- Test: `src/components/MatchScoreEditor.test.tsx`

- [ ] **Step 1: Escribe el test (falla)**

`src/components/MatchScoreEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MatchScoreEditor } from "./MatchScoreEditor";
import type { AdminMatchView } from "@/../convex/types";

const m = (p: Partial<AdminMatchView>): AdminMatchView => ({
  externalId: "m1", stage: "group", label: "Grupos",
  homeTeam: { code: "MEX", name: "México", flag: "🇲🇽", group: "A" },
  awayTeam: { code: "BRA", name: "Brasil", flag: "🇧🇷", group: "A" },
  homeExternalId: "MEX", awayExternalId: "BRA",
  homeScore: null, awayScore: null, status: "scheduled", winnerExternalId: null, manualOverride: false, ...p,
});

describe("MatchScoreEditor", () => {
  it("emite onSave con el marcador (sin ganador en grupos)", () => {
    const onSave = vi.fn();
    render(<MatchScoreEditor matches={[m({})]} savingId={null} onSave={onSave} onRevert={() => {}} />);
    fireEvent.change(screen.getByLabelText("Goles MEX"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Goles BRA"), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Guardar marcador"));
    expect(onSave).toHaveBeenCalledWith("m1", 2, 1, undefined);
  });
  it("oculta partidos sin equipos definidos", () => {
    render(<MatchScoreEditor matches={[m({ homeTeam: null })]} savingId={null} onSave={() => {}} onRevert={() => {}} />);
    expect(screen.queryByLabelText("Guardar marcador")).toBeNull();
  });
});
```

- [ ] **Step 2: Corre el test (debe fallar)**

Run: `npx vitest run src/components/MatchScoreEditor.test.tsx`
Expected: FAIL — no existe el componente.

- [ ] **Step 3: Implementa `src/components/MatchScoreEditor.tsx`**

Porta la lógica del bloque "Corregir marcador" de `Admin.tsx`, parametrizada por props (estado de formulario interno; las mutaciones las hace el padre vía `onSave`/`onRevert`):

```tsx
import { useState } from "react";
import type { AdminMatchView } from "@/../convex/types";
import { SectionHeading } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckIcon } from "lucide-react";

type Sel = "home" | "draw" | "away";

export function MatchScoreEditor({
  matches, savingId, onSave, onRevert,
}: {
  matches: AdminMatchView[];
  savingId: string | null;
  onSave: (externalId: string, homeScore: number, awayScore: number, winnerExternalId: string | null | undefined) => void;
  onRevert: (externalId: string) => void;
}) {
  const [scores, setScores] = useState<Record<string, { h?: string; a?: string }>>({});
  const [winners, setWinners] = useState<Record<string, Sel>>({});

  function selectedWinner(m: AdminMatchView): Sel {
    return (
      winners[m.externalId] ??
      (m.winnerExternalId && m.winnerExternalId === m.homeExternalId
        ? "home"
        : m.winnerExternalId && m.winnerExternalId === m.awayExternalId
          ? "away"
          : "draw")
    );
  }

  function handleSave(m: AdminMatchView) {
    const s = scores[m.externalId] ?? {};
    const homeScore = Number(s.h ?? m.homeScore ?? 0);
    const awayScore = Number(s.a ?? m.awayScore ?? 0);
    let winnerExternalId: string | null | undefined = undefined;
    if (m.stage !== "group") {
      const sel = selectedWinner(m);
      winnerExternalId = sel === "home" ? m.homeExternalId : sel === "away" ? m.awayExternalId : null;
    }
    onSave(m.externalId, homeScore, awayScore, winnerExternalId);
  }

  function handleRevert(externalId: string) {
    setWinners((prev) => {
      const next = { ...prev };
      delete next[externalId];
      return next;
    });
    onRevert(externalId);
  }

  const playableMatches = matches.filter((m) => m.homeTeam && m.awayTeam);

  return (
    <>
      <SectionHeading>Corregir marcador</SectionHeading>
      {playableMatches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
          No hay partidos con equipos definidos todavía.
        </div>
      ) : (
        <div className="space-y-2.5">
          {playableMatches.map((m) => {
            const s = scores[m.externalId] ?? {};
            const saving = savingId === m.externalId;
            return (
              <div key={m.externalId} className="rounded-2xl border border-border bg-card px-3.5 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">{m.label}</span>
                  {m.manualOverride && (
                    <span className="flex items-center gap-2">
                      <span className="text-[0.65rem] font-semibold text-gold">editado a mano</span>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleRevert(m.externalId)}
                        className="text-[0.65rem] font-semibold text-muted-foreground underline-offset-2 hover:text-gold hover:underline disabled:opacity-50"
                      >
                        ↺ volver al automático
                      </button>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="text-lg leading-none">{m.homeTeam!.flag}</span>
                    <span className="truncate text-sm font-medium">{m.homeTeam!.code}</span>
                  </span>
                  <Input
                    type="number" min={0} inputMode="numeric"
                    aria-label={`Goles ${m.homeTeam!.code}`}
                    className="h-9 w-12 shrink-0 text-center"
                    value={s.h ?? (m.homeScore ?? "")}
                    onChange={(e) => setScores((prev) => ({ ...prev, [m.externalId]: { ...prev[m.externalId], h: e.target.value } }))}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="number" min={0} inputMode="numeric"
                    aria-label={`Goles ${m.awayTeam!.code}`}
                    className="h-9 w-12 shrink-0 text-center"
                    value={s.a ?? (m.awayScore ?? "")}
                    onChange={(e) => setScores((prev) => ({ ...prev, [m.externalId]: { ...prev[m.externalId], a: e.target.value } }))}
                  />
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
                    <span className="truncate text-sm font-medium">{m.awayTeam!.code}</span>
                    <span className="text-lg leading-none">{m.awayTeam!.flag}</span>
                  </span>
                  <Button
                    size="icon" className="size-9 shrink-0 rounded-lg" disabled={saving}
                    aria-label="Guardar marcador" onClick={() => handleSave(m)}
                  >
                    {saving ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <CheckIcon />}
                  </Button>
                </div>
                {m.stage !== "group" && (
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <span className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">Ganador</span>
                    {([["home", m.homeTeam!.code], ["draw", "Empate"], ["away", m.awayTeam!.code]] as const).map(([key, lbl]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setWinners((p) => ({ ...p, [m.externalId]: key }))}
                        className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${selectedWinner(m) === key ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground"}`}
                        aria-pressed={selectedWinner(m) === key}
                        aria-label={`Ganador ${lbl}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Refactoriza `Admin.tsx` para usar `MatchScoreEditor`**

En `src/routes/Admin.tsx`:
1. Añade el import: `import { MatchScoreEditor } from "@/components/MatchScoreEditor";`.
2. **Borra** del componente lo que se movió: el estado `const [scores, setScores] = …` y `const [winners, setWinners] = …`; los handlers `selectedWinner`, `saveScore`, `revertScore`; el `type AdminMatch = …`; la constante `const playableMatches = …`; y el import `CheckIcon` de `lucide-react` (queda `CopyIcon, LinkIcon`). Mantén `const [savingId, setSavingId] = useState<string | null>(null);` y las mutations `setResult`/`clearOverride`.
3. Añade dos handlers que envuelven las mutations:

```tsx
  async function onSaveScore(
    externalId: string, homeScore: number, awayScore: number, winnerExternalId: string | null | undefined,
  ) {
    setSavingId(externalId);
    try {
      await setResult({ adminToken: token!, matchExternalId: externalId, homeScore, awayScore, finished: true, winnerExternalId });
      toast.success("Marcador actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSavingId(null);
    }
  }

  async function onRevertScore(externalId: string) {
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

4. Reemplaza todo el bloque JSX que empieza en `<SectionHeading>Corregir marcador</SectionHeading>` y termina al cierre de su lista por:

```tsx
      <MatchScoreEditor
        matches={data.matches}
        savingId={savingId}
        onSave={(id, h, a, w) => void onSaveScore(id, h, a, w)}
        onRevert={(id) => void onRevertScore(id)}
      />
```

- [ ] **Step 5: Corre los tests + typecheck**

Run: `npx vitest run src/components/MatchScoreEditor.test.tsx && npx tsc -b`
Expected: PASS y sin errores. El admin clásico sigue corrigiendo marcadores igual que antes (verifícalo en el dev).

- [ ] **Step 6: Commit**

```bash
git add src/components/MatchScoreEditor.tsx src/components/MatchScoreEditor.test.tsx src/routes/Admin.tsx
git commit -m "refactor(admin): extrae MatchScoreEditor reutilizable (clásico + progol)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Vistas `ProgolGeneral` + `ProgolPersonal` y ruteo en `Join`/`Personal`

**Files:**
- Create: `src/routes/progol/ProgolGeneral.tsx`, `src/routes/progol/ProgolPersonal.tsx`
- Modify: `src/routes/Join.tsx`, `src/routes/Personal.tsx`

- [ ] **Step 1: Crea `src/routes/progol/ProgolGeneral.tsx`** (leaderboard + inscripción + ver a otros)

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import { persistToken, readStoredToken } from "@/lib/storage";
import { Shell, BottomNav } from "@/components/Shell";
import { SectionHeading, PrizeBanner } from "@/components/bits";
import { Leaderboard } from "@/components/Leaderboard";
import { PredictMatchRow } from "@/components/PredictMatchRow";
import { prizeBanner } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

function LoadingState() {
  return (
    <Shell>
      <Skeleton className="h-14 w-full rounded-2xl" />
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}
      </div>
    </Shell>
  );
}

export function ProgolGeneral({ id, joinToken }: { id: string; joinToken: string }) {
  const data = useQuery(api.progol.getGeneral, { joinToken });
  const join = useMutation(api.participants.joinQuiniela);
  const { upload, uploading } = usePhotoUpload();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  if (data === undefined) return <LoadingState />;
  const { quiniela } = data;
  const alreadyJoined = !!readStoredToken(id, "me");
  const canJoin = quiniela.status === "open";
  const statusLabel = quiniela.status === "open" ? "Inscripciones abiertas"
    : quiniela.status === "locked" ? "Inscripciones cerradas" : "Mundial finalizado";

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const photoId = file ? await upload(file) : undefined;
      const res = await join({ joinToken, name, photoId: photoId as Id<"_storage"> | undefined });
      persistToken(id, "me", res.personalToken);
      nav(`/q/${id}/me/${res.personalToken}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell bottomNav={<BottomNav id={id} active="general" joinToken={joinToken} />}>
      <header className="grain bg-pitch header-safe relative -mx-4 overflow-hidden rounded-b-3xl border-b border-border px-4 pb-6">
        <div className="flex items-center gap-3.5">
          {quiniela.photoUrl ? (
            <img src={quiniela.photoUrl} alt="" className="size-14 shrink-0 rounded-2xl object-cover ring-1 ring-border" />
          ) : (
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-3xl ring-1 ring-border">🎯</div>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-extrabold tracking-tight">{quiniela.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {quiniela.filledCount} {quiniela.filledCount === 1 ? "jugador" : "jugadores"} · <span className="text-foreground/70">{statusLabel}</span>
            </p>
          </div>
        </div>
        {(() => { const b = prizeBanner(quiniela.prize, quiniela.status, " al líder"); return b ? <PrizeBanner title={b.title} subline={b.subline} /> : null; })()}
      </header>

      {quiniela.notes && (
        <>
          <SectionHeading>Notas</SectionHeading>
          <div className="grain relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-3 text-sm whitespace-pre-wrap text-foreground/90">
            {quiniela.notes}
          </div>
        </>
      )}

      <SectionHeading>
        Tabla de posiciones
        <span className="ml-1.5 font-medium text-foreground/40">{data.decidedMatches} jugados</span>
      </SectionHeading>
      <Leaderboard rows={data.leaderboard} onSelect={setViewing} />

      <Link to={`/q/${id}/mundial`} className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold transition-colors hover:bg-secondary">
        <span className="flex items-center gap-2"><span className="text-lg">🌍</span> Ver grupos y bracket del Mundial</span>
        <span className="text-muted-foreground">→</span>
      </Link>

      {!alreadyJoined && (canJoin ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="lg" className="glow-primary mt-6 h-12 w-full rounded-2xl text-base font-bold" />}>
            🎯 Unirme a la quiniela
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Unirte a {quiniela.name}</DialogTitle>
              <DialogDescription>Pronostica cada partido. ¡Gana quien más acierte!</DialogDescription>
            </DialogHeader>
            <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="join-name">Tu nombre</Label>
                <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. María" maxLength={40} autoFocus />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="join-photo">Foto (opcional)</Label>
                <Input id="join-photo" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <Button type="submit" size="lg" className="h-11 rounded-xl font-bold" disabled={busy || uploading || !name.trim()}>
                {busy || uploading ? "Entrando…" : "Confirmar inscripción"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      ) : (
        <div className="mt-6 rounded-2xl border border-border bg-card px-4 py-3.5 text-center text-sm text-muted-foreground">
          Las inscripciones ya están cerradas.
        </div>
      ))}

      <ViewCardDialog joinToken={joinToken} participantId={viewing} onClose={() => setViewing(null)} />
    </Shell>
  );
}

/** Tarjeta read-only de otro jugador (pronósticos siempre visibles). */
function ViewCardDialog({ joinToken, participantId, onClose }: { joinToken: string; participantId: string | null; onClose: () => void }) {
  const card = useQuery(api.progol.getCard, participantId ? { joinToken, participantId: participantId as Id<"participants"> } : "skip");
  return (
    <Dialog open={!!participantId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{card?.who.name ?? "Pronósticos"}</DialogTitle>
          <DialogDescription>{card ? `Lugar #${card.who.rank} · ${card.who.points} pts` : "Cargando…"}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {card?.stages.map((s) => {
            const shown = s.matches.filter((m) => m.state !== "pending");
            if (shown.length === 0) return null;
            return (
              <div key={s.stage}>
                <div className="mb-1.5 text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">{s.label}</div>
                <div className="space-y-2">{shown.map((m) => <PredictMatchRow key={m.matchId} m={m} editable={false} />)}</div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Crea `src/routes/progol/ProgolPersonal.tsx`** (mis pronósticos editables)

```tsx
import { useQuery, useMutation } from "convex/react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { Pick } from "@/../convex/types";
import { Avatar } from "@/components/Avatar";
import { NotificationBell } from "@/components/NotificationBell";
import { PushOptIn } from "@/components/PushOptIn";
import { Shell, BottomNav } from "@/components/Shell";
import { PrizeBanner } from "@/components/bits";
import { PredictMatchRow } from "@/components/PredictMatchRow";
import { Skeleton } from "@/components/ui/skeleton";
import { prizeBanner } from "@/lib/format";

function LoadingState() {
  return (
    <Shell>
      <Skeleton className="h-14 w-full rounded-2xl" />
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
    </Shell>
  );
}

export function ProgolPersonal({ id, personalToken }: { id: string; personalToken: string }) {
  const data = useQuery(api.progol.getPersonal, { personalToken });
  const predict = useMutation(api.progol.predict);

  if (data === undefined) return <LoadingState />;
  const { who } = data;

  async function onPick(matchId: string, pick: Pick) {
    try {
      await predict({ personalToken, matchId: matchId as Id<"matches">, pick });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el pronóstico");
    }
  }

  return (
    <Shell bottomNav={<BottomNav id={id} active="me" meToken={personalToken} joinToken={data.joinToken} />}>
      <header className="grain bg-pitch header-safe relative -mx-4 overflow-hidden rounded-b-3xl border-b border-border px-4 pb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={who.name} url={who.photoUrl} size={48} />
            <div className="min-w-0">
              <h1 className="truncate font-heading text-2xl font-extrabold tracking-tight">{who.name}</h1>
              <p className="truncate text-sm text-muted-foreground">{data.quinielaName}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start">
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-center font-heading text-xs font-bold text-primary">
              #{who.rank} · {who.points} pts
            </span>
            <NotificationBell quinielaId={id} token={personalToken} kind="me" />
          </div>
        </div>
        {(() => { const b = prizeBanner(data.prize, data.status, " al líder"); return b ? <PrizeBanner title={b.title} subline={b.subline} /> : null; })()}
      </header>

      <PushOptIn personalToken={personalToken} />

      <div className="mt-2 space-y-5">
        {data.stages.map((s) => (
          <div key={s.stage}>
            <div className="mb-2 px-1 text-[0.7rem] font-bold tracking-[0.14em] text-muted-foreground uppercase">{s.label}</div>
            <div className="space-y-2.5">
              {s.matches.map((m) => <PredictMatchRow key={m.matchId} m={m} editable onPick={onPick} />)}
            </div>
          </div>
        ))}
      </div>

      <Link to={`/q/${id}/mundial`} className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold transition-colors hover:bg-secondary">
        <span className="flex items-center gap-2"><span className="text-lg">🌍</span> Ver grupos y bracket del Mundial</span>
        <span className="text-muted-foreground">→</span>
      </Link>
    </Shell>
  );
}
```

- [ ] **Step 3: Ruteo por modo en `src/routes/Join.tsx`**

1. Añade el import: `import { ProgolGeneral } from "@/routes/progol/ProgolGeneral";` (`Id` ya está importado).
2. Sustituye la query `data` por la versión con `getMode` + skip:

```tsx
  const mode = useQuery(api.quinielas.getMode, { id: id as Id<"quinielas"> });
  const data = useQuery(
    api.quinielas.getOverview,
    mode?.gameMode === "clasica" ? { joinToken: token! } : "skip",
  );
```

3. Justo antes de `if (data === undefined) return <LoadingState />;` añade:

```tsx
  if (mode === undefined) return <LoadingState />;
  if (mode.gameMode === "progol") return <ProgolGeneral id={id!} joinToken={token!} />;
```

- [ ] **Step 4: Ruteo por modo en `src/routes/Personal.tsx`**

1. Añade imports: `import type { Id } from "@/../convex/_generated/dataModel";` y `import { ProgolPersonal } from "@/routes/progol/ProgolPersonal";`.
2. Sustituye la query `data`:

```tsx
  const mode = useQuery(api.quinielas.getMode, { id: id as Id<"quinielas"> });
  const data = useQuery(
    api.participants.getPersonalPanel,
    mode?.gameMode === "clasica" ? { personalToken: token! } : "skip",
  );
```

3. Justo antes de `if (data === undefined) return <LoadingState />;` añade:

```tsx
  if (mode === undefined) return <LoadingState />;
  if (mode.gameMode === "progol") return <ProgolPersonal id={id!} personalToken={token!} />;
```

- [ ] **Step 5: Typecheck + verifica en el dev**

Run: `npx tsc -b`
Expected: sin errores. En una quiniela progol, "General" muestra el leaderboard (y tocar a alguien abre su tarjeta) y "Mi panel" muestra los pronósticos editables; en una clásica todo sigue igual.

- [ ] **Step 6: Commit**

```bash
git add src/routes/progol/ProgolGeneral.tsx src/routes/progol/ProgolPersonal.tsx src/routes/Join.tsx src/routes/Personal.tsx
git commit -m "feat(progol): vistas General (leaderboard) y Mi panel (pronósticos) + ruteo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Vista `ProgolAdmin` y ruteo en `Admin`

**Files:**
- Create: `src/routes/progol/ProgolAdmin.tsx`
- Modify: `src/routes/Admin.tsx`

- [ ] **Step 1: Crea `src/routes/progol/ProgolAdmin.tsx`**

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Shell } from "@/components/Shell";
import { NotificationBell } from "@/components/NotificationBell";
import { PushOptIn } from "@/components/PushOptIn";
import { SectionHeading } from "@/components/bits";
import { PaymentStatusMenu } from "@/components/PaymentStatusMenu";
import { MatchScoreEditor } from "@/components/MatchScoreEditor";
import { formatMXN } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyIcon, LinkIcon } from "lucide-react";

function LoadingState() {
  return (
    <Shell>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-4 h-28 rounded-2xl" />
      <div className="mt-8 space-y-2.5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
    </Shell>
  );
}

export function ProgolAdmin({ id, adminToken }: { id: string; adminToken: string }) {
  const data = useQuery(api.progol.getAdmin, { adminToken });
  const closeReg = useMutation(api.progol.closeRegistration);
  const saveNotes = useMutation(api.quinielas.updateNotes);
  const setPayment = useMutation(api.participants.setParticipantPayment);
  const setResult = useMutation(api.matches.setMatchResultManual);
  const clearOverride = useMutation(api.matches.clearMatchOverride);

  const [closing, setClosing] = useState(false);
  const [notesEdit, setNotesEdit] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  if (data === undefined) return <LoadingState />;
  const { quiniela } = data;
  const joinUrl = `${location.origin}/q/${id}/join/${quiniela.joinToken}`;
  const savedNotes = quiniela.notes ?? "";
  const notesValue = notesEdit ?? savedNotes;
  const perPerson = quiniela.prize.mode === "per_person";
  const statusLabel = quiniela.status === "open" ? "Abierta" : quiniela.status === "locked" ? "Cerrada" : "Finalizada";

  async function copy(text: string, msg = "Copiado") {
    try { await navigator.clipboard.writeText(text); toast.success(msg); }
    catch { toast.error("No se pudo copiar al portapapeles"); }
  }
  async function onClose() {
    setClosing(true);
    try { await closeReg({ adminToken }); toast.success("Inscripción cerrada"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo cerrar"); }
    finally { setClosing(false); }
  }
  async function onSaveNotes() {
    setSavingNotes(true);
    try { await saveNotes({ adminToken, notes: notesValue }); setNotesEdit(null); toast.success("Notas guardadas"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudieron guardar las notas"); }
    finally { setSavingNotes(false); }
  }
  async function onSelectPayment(participantId: string, method: "pending" | "efectivo" | "transferencia") {
    setSavingPaymentId(participantId);
    try { await setPayment({ adminToken, participantId: participantId as Id<"participants">, method }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo actualizar el pago"); }
    finally { setSavingPaymentId(null); }
  }
  async function onSaveScore(externalId: string, homeScore: number, awayScore: number, winnerExternalId: string | null | undefined) {
    setSavingId(externalId);
    try { await setResult({ adminToken, matchExternalId: externalId, homeScore, awayScore, finished: true, winnerExternalId }); toast.success("Marcador actualizado"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setSavingId(null); }
  }
  async function onRevertScore(externalId: string) {
    setSavingId(externalId);
    try { await clearOverride({ adminToken, matchExternalId: externalId }); toast.success("Volvió al resultado automático"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo revertir"); }
    finally { setSavingId(null); }
  }

  return (
    <Shell>
      <header className="grain bg-pitch relative -mx-4 -mt-5 overflow-hidden rounded-b-3xl border-b border-border px-4 pt-8 pb-6">
        <p className="text-xs font-bold tracking-[0.2em] text-gold uppercase">Panel de administración · Progol</p>
        <h1 className="mt-1 truncate pr-12 font-heading text-2xl font-extrabold tracking-tight">{quiniela.name}</h1>
        <div className="absolute top-6 right-4"><NotificationBell quinielaId={id} token={adminToken} kind="admin" /></div>
      </header>

      <div className="grain relative mt-5 overflow-hidden rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><LinkIcon className="size-4 text-primary" /> Link de invitación</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">{quiniela.filledCount} inscritos · {statusLabel}</span>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">{joinUrl}</code>
          <Button size="icon" className="size-9 shrink-0 rounded-lg" onClick={() => void copy(joinUrl)} aria-label="Copiar link de invitación"><CopyIcon /></Button>
        </div>
        <p className="mt-2 text-[0.7rem] text-muted-foreground">Comparte este link para que cualquiera se inscriba (sin límite).</p>
      </div>

      <PushOptIn adminToken={adminToken} />

      <SectionHeading>Notas</SectionHeading>
      <div className="grain relative overflow-hidden rounded-2xl border border-border bg-card p-4">
        <Textarea value={notesValue} onChange={(e) => setNotesEdit(e.target.value)} placeholder="Reglas, fecha límite de pago, sede… (visible para todos)" aria-label="Notas de la quiniela (visible para todos)" maxLength={1000} rows={3} />
        <Button size="sm" className="mt-2.5 rounded-lg" disabled={savingNotes || notesValue === savedNotes} onClick={() => void onSaveNotes()}>{savingNotes ? "Guardando…" : "Guardar notas"}</Button>
      </div>

      {quiniela.status === "open" && (
        <Button size="lg" className="glow-primary mt-4 h-12 w-full rounded-2xl text-base font-bold" disabled={closing} onClick={() => void onClose()}>
          {closing ? "Cerrando…" : "🔒 Cerrar inscripción"}
        </Button>
      )}

      <SectionHeading>Participantes <span className="ml-1.5 font-medium text-foreground/40">{data.participants.length}</span></SectionHeading>
      {perPerson && (
        <div className="grain relative mb-2.5 overflow-hidden rounded-2xl border border-gold/30 bg-card px-4 py-3 text-sm">
          <div className="font-semibold text-gold">Bote confirmado: {formatMXN(quiniela.prize.pool ?? 0)}</div>
          <div className="mt-0.5 text-[0.7rem] text-muted-foreground">{quiniela.prize.contributors}/{quiniela.filledCount} pagados</div>
        </div>
      )}
      <div className="space-y-2.5">
        {data.participants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">Aún no se inscribe nadie.</div>
        ) : (
          data.participants.map((p) => (
            <div key={p.personalToken} className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="truncate font-heading text-sm font-semibold">{p.name}</div>
                <div className="text-[0.7rem] text-muted-foreground">{p.points} {p.points === 1 ? "punto" : "puntos"}</div>
              </div>
              {perPerson && (
                <PaymentStatusMenu paid={p.paid} method={p.paymentMethod} disabled={savingPaymentId === p.id} onSelect={(method) => void onSelectPayment(p.id, method)} />
              )}
              <Button size="sm" variant="outline" className="shrink-0 rounded-lg" onClick={() => void copy(`${location.origin}/q/${id}/me/${p.personalToken}`, "Link personal copiado")}><LinkIcon /> Copiar link</Button>
            </div>
          ))
        )}
      </div>

      <MatchScoreEditor
        matches={data.matches}
        savingId={savingId}
        onSave={(eid, h, a, w) => void onSaveScore(eid, h, a, w)}
        onRevert={(eid) => void onRevertScore(eid)}
      />
    </Shell>
  );
}
```

- [ ] **Step 2: Ruteo por modo en `src/routes/Admin.tsx`**

1. Añade el import: `import { ProgolAdmin } from "@/routes/progol/ProgolAdmin";` (`Id` ya está importado).
2. Sustituye la query `data`:

```tsx
  const mode = useQuery(api.quinielas.getMode, { id: id as Id<"quinielas"> });
  const data = useQuery(
    api.quinielas.getAdmin,
    mode?.gameMode === "clasica" ? { adminToken: token! } : "skip",
  );
```

3. Justo antes de `if (data === undefined) return <LoadingState />;` añade:

```tsx
  if (mode === undefined) return <LoadingState />;
  if (mode.gameMode === "progol") return <ProgolAdmin id={id!} adminToken={token!} />;
```

- [ ] **Step 3: Typecheck + verifica en el dev**

Run: `npx tsc -b`
Expected: sin errores. El admin de una quiniela progol muestra puntos por jugador, "Cerrar inscripción" y el corrector de marcador; el admin clásico sigue igual.

- [ ] **Step 4: Commit**

```bash
git add src/routes/progol/ProgolAdmin.tsx src/routes/Admin.tsx
git commit -m "feat(progol): panel de admin progol + ruteo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Verificación completa + E2E

**Files:** ninguno (verificación; si algo truena, corrige en el task correspondiente).

- [ ] **Step 1: Suite completa de tests**

Run: `npm test`
Expected: TODO en verde (backend `edge-runtime` + front `jsdom`), incluyendo los tests clásicos sin regresiones.

- [ ] **Step 2: Typecheck + lint puntual**

Run: `npx tsc -b && npx eslint convex src`
Expected: sin errores. (Usa `convex src` y no `.`: `eslint .` falla por el código de sesiones concurrentes en `.claude/worktrees`.)

- [ ] **Step 3: E2E con la app real (Playwright)**

Levanta el backend y el front en local (Convex dev + Vite) y recorre el flujo progol en el navegador:

1. En `/` elige **Modo de juego → Progol**; confirma que desaparecen "participantes" y "reparto"; crea la quiniela (premio fijo o por persona).
2. Copia el link de invitación; en una pestaña/identidad nueva únete como **Ana**, y en otra como **Beto** (sin tope de lugares).
3. Como Ana, en **Mi panel** pronostica varios partidos de grupos (1/X/2); recarga y confirma que el pronóstico persiste y es editable antes del saque.
4. Como admin, en el corrector de marcador, finaliza uno de esos partidos con un resultado.
5. En **General** confirma que el leaderboard suma el punto a quien acertó y ordena por puntos; toca a un jugador y verifica que se abre su tarjeta de pronósticos (read-only).
6. Abre **Mundial** y confirma que NO aparecen caras/nombres de dueño (grupos y bracket).
7. (Opcional) Fuerza el `kickoffAt` del primer partido al pasado y corre el sync/cron; confirma que la inscripción se cierra (`status: locked`) y que, al definir una eliminatoria, llega el aviso "Nuevos partidos para pronosticar".

Expected: todo el flujo funciona; una quiniela clásica creada en paralelo sigue comportándose como antes.

- [ ] **Step 4: Commit final (si hubo ajustes de verificación)**

```bash
git add -A
git commit -m "test(progol): verificación E2E del modo Progol

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Cobertura del spec (auto-revisión)

| Requisito del spec | Task(s) |
|---|---|
| Campo `gameMode` + tabla `predictions` + `gameModeOf` | 1 |
| Lógica pura (resultado 1/X/2, pronosticable, estado UI, leaderboard, desbloqueo, avisos) | 2 |
| Tipos de vista (leaderboard, tarjeta, admin) | 3 |
| `createQuiniela` progol + `getMode` para ruteo | 4 |
| `joinQuiniela` sin tope ni reparto | 5 |
| `predict` (upsert, bloqueo al saque) | 6 |
| `getGeneral` (leaderboard, ganador, finished) | 7 |
| `getPersonal` + `getCard` (ver mis pronósticos y los de otros) | 8 |
| `getAdmin` + `closeRegistration` | 9 |
| Cierre de inscripción al primer partido + avisos de desbloqueo | 10 |
| Mundial sin caras de dueño | 11 |
| Selector de modo en creación | 12 |
| `PickSelector` / `PredictMatchRow` / `Leaderboard` | 13 |
| Corrección de marcador reutilizable (admin) | 14 |
| Vistas General + Mi panel + ruteo por modo | 15 |
| Vista Admin progol + ruteo | 16 |
| Premio fijo/por persona + pagos | reúso (`prizeView`, `PaymentStatusMenu`) en 7/9/16 |
| Verificación + E2E | 17 |

**Supuestos del spec (§12) ya incorporados:** desempate = colíderes comparten rank 1 (Task 2); `numParticipants = 0` = sin límite (Tasks 4/5); "ver a otros" como Dialog (Task 15); sin recordatorio "empieza pronto" en v1.

---

## Notas de ejecución

- **TDD estricto:** en cada task, primero el test (rojo), luego la implementación (verde). No adelantes implementación sin su test en rojo.
- **Commits atómicos:** un commit por task (los frontend-only sin test unitario se verifican con `tsc`/dev y se cubren en el E2E de la Task 17).
- **No romper la clásica:** las únicas modificaciones al camino clásico son ramas tempranas aditivas (`createQuiniela`, `joinQuiniela`, `autoCloseDue`, `detectFromSync`, `getMundial`) y la extracción presentacional de `MatchScoreEditor`. Corre los tests clásicos en cada task que toque archivos compartidos.
- **Sesiones concurrentes:** otra sesión puede commitear a `main` en paralelo; haz `git pull --rebase` si el push es rechazado y revisa que el `convex/_generated/api.d.ts` registre `progol`.
