# Fase 1: Backend multi-torneo + web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalizar el backend de "la app del Mundial" a múltiples Torneos de football-data.org (catálogo free tier), y exponer en la web el selector de torneo, la Vista Torneo adaptativa y el Progol por Ronda.

**Architecture:** Campos `tournamentCode` opcionales + backfill a "WC" (migración aditiva, cero downtime sobre producción durante el Mundial). Catálogo declarado en código con formato (`eliminatorio`/`liga`) que determina modos de juego (ADR-0001, CONTEXT.md). Sync solo de torneos con quinielas activas; sync inicial al preparar la creación. Toda resolución por quiniela sigue pasando por `resolveQuiniela`, ahora scoped por torneo.

**Tech Stack:** Convex (queries/mutations/actions/crons), convex-test + vitest, React 19 + Tailwind v4 (web), football-data.org v4.

**Reglas del repo:** TDD, commits atómicos en español (`feat(scope): …`), ESLint prohíbe setState-en-useEffect (usar estado derivado). Deploy manual front+back juntos (Convex prod `resilient-shrimp-254`, Railway).

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `convex/lib/tournaments.ts` | Crear | Catálogo en código: code, nombres, formato, modos permitidos, normalización legacy |
| `convex/lib/tournaments.test.ts` | Crear | Tests puros del catálogo |
| `convex/schema.ts` | Modificar | `tournamentCode` (teams/matches/quinielas), `matchday`, índices por torneo |
| `convex/migrations.ts` | Crear | Backfill `tournamentCode = "WC"` en filas legacy |
| `convex/lib/footballData.ts` | Modificar | URL por competición, `matchday`, stage `REGULAR_SEASON→league`, `fetchTeams` |
| `convex/lib/footballData.test.ts` | Modificar | Tests de mapeo nuevos |
| `convex/matches.ts` | Modificar | `upsertMatchResult`/`recomputeTeamStates` scoped; `upsertTeam` |
| `convex/sync.ts` | Modificar | `syncTournament(code)`, loop de torneos activos con espaciado de rate limit |
| `convex/tournaments.ts` | Crear | `list` (catálogo+estado de datos) y `prepare` (sync inicial on-demand) |
| `convex/quinielas.ts` | Modificar | `createQuiniela` con torneo + validación formato/modo + slotSizes por teamCount; `redistributeAndLock` y `autoCloseDue` scoped |
| `convex/lib/perQuiniela.ts` | Modificar | `resolveQuiniela` filtra por torneo de la quiniela; liga sin estados de eliminación |
| `convex/lib/standings.ts` | Crear | Tabla de posiciones de liga (pura) |
| `convex/lib/progol.ts` | Modificar | `isSeasonDone(format, rows)` — cierre de temporada para liga |
| `convex/mundial.ts` | Modificar | `getTorneo` (union brackets/league); `getMundial` queda como alias |
| `src/routes/Home.tsx` | Modificar | Selector de torneo, modos filtrados, tope por teamCount |
| `src/routes/Mundial.tsx` | Modificar | Render adaptativo por formato |
| `src/components/StandingsView.tsx` | Crear | Tabla de posiciones (liga) |
| `src/components/BottomNav.tsx` | Modificar | Label del tab = shortName del torneo |
| `src/main.tsx` | Modificar | Ruta alias `/q/:id/torneo` |
| `src/routes/progol/ProgolPersonal.tsx` | Modificar | Navegación por Ronda (jornadas en liga) |

---

### Task 1: Catálogo de Torneos (`convex/lib/tournaments.ts`)

**Files:**
- Create: `convex/lib/tournaments.ts`
- Test: `convex/lib/tournaments.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/lib/tournaments.test.ts
import { describe, expect, it } from "vitest";
import { TOURNAMENTS, tournamentByCode, allowedGameModes, tournamentCodeOf } from "./tournaments";

describe("catálogo de torneos", () => {
  it("incluye el Mundial con formato eliminatorio", () => {
    const wc = tournamentByCode("WC");
    expect(wc).toMatchObject({ code: "WC", format: "eliminatorio" });
  });

  it("las ligas solo admiten progol; los eliminatorios ambos modos", () => {
    expect(allowedGameModes("liga")).toEqual(["progol"]);
    expect(allowedGameModes("eliminatorio")).toEqual(["clasica", "progol"]);
  });

  it("todo torneo del catálogo tiene code, name, shortName y format válidos", () => {
    for (const t of TOURNAMENTS) {
      expect(t.code).toMatch(/^[A-Z0-9]{2,4}$/);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.shortName.length).toBeGreaterThan(0);
      expect(["eliminatorio", "liga"]).toContain(t.format);
    }
  });

  it("tournamentByCode devuelve undefined para códigos fuera del catálogo", () => {
    expect(tournamentByCode("XX")).toBeUndefined();
  });

  it("tournamentCodeOf normaliza filas legacy sin código a WC", () => {
    expect(tournamentCodeOf({})).toBe("WC");
    expect(tournamentCodeOf({ tournamentCode: "PL" })).toBe("PL");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/tournaments.test.ts`
Expected: FAIL — `Cannot find module './tournaments'`

- [ ] **Step 3: Write the implementation**

```ts
// convex/lib/tournaments.ts
// Catálogo de Torneos (ADR-0001): las competiciones del free tier de
// football-data.org, declaradas en código porque formato y nombre corto
// requieren curaduría y cambian ~1 vez al año.
export type TournamentFormat = "eliminatorio" | "liga";
export type GameMode = "clasica" | "progol";

export type Tournament = {
  code: string;        // código football-data (path de la API)
  name: string;        // nombre completo para el selector
  shortName: string;   // label del tab Vista Torneo
  format: TournamentFormat;
};

export const TOURNAMENTS: Tournament[] = [
  { code: "WC",  name: "Copa del Mundo 2026",      shortName: "Mundial",     format: "eliminatorio" },
  { code: "CL",  name: "UEFA Champions League",    shortName: "Champions",   format: "eliminatorio" },
  { code: "EC",  name: "Eurocopa",                 shortName: "Euro",        format: "eliminatorio" },
  { code: "PL",  name: "Premier League",           shortName: "Premier",     format: "liga" },
  { code: "PD",  name: "La Liga",                  shortName: "La Liga",     format: "liga" },
  { code: "SA",  name: "Serie A",                  shortName: "Serie A",     format: "liga" },
  { code: "BL1", name: "Bundesliga",               shortName: "Bundesliga",  format: "liga" },
  { code: "FL1", name: "Ligue 1",                  shortName: "Ligue 1",     format: "liga" },
  { code: "DED", name: "Eredivisie",               shortName: "Eredivisie",  format: "liga" },
  { code: "PPL", name: "Primeira Liga",            shortName: "Primeira",    format: "liga" },
  { code: "ELC", name: "Championship",             shortName: "Championship", format: "liga" },
  { code: "BSA", name: "Brasileirão",              shortName: "Brasileirão", format: "liga" },
];

export function tournamentByCode(code: string): Tournament | undefined {
  return TOURNAMENTS.find((t) => t.code === code);
}

/** Clásica exige eliminación real (CONTEXT.md); las ligas solo admiten Progol. */
export function allowedGameModes(format: TournamentFormat): GameMode[] {
  return format === "eliminatorio" ? ["clasica", "progol"] : ["progol"];
}

/** Normaliza filas legacy: sin tournamentCode = Mundial (pre multi-torneo). */
export function tournamentCodeOf(doc: { tournamentCode?: string }): string {
  return doc.tournamentCode ?? "WC";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/tournaments.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add convex/lib/tournaments.ts convex/lib/tournaments.test.ts
git commit -m "feat(torneos): catálogo de torneos en código con formato y modos permitidos"
```

---

### Task 2: Schema — `tournamentCode`, `matchday` e índices por torneo

**Files:**
- Modify: `convex/schema.ts`

Cambio aditivo (campos opcionales + índices nuevos): seguro de desplegar sobre datos vivos. Las filas legacy se normalizan vía `tournamentCodeOf` hasta el backfill (Task 3).

- [ ] **Step 1: Edit `convex/schema.ts`**

En `teams` (líneas 5-16), añadir campo e índices:

```ts
  teams: defineTable({
    code: v.string(),
    name: v.string(),
    flag: v.string(), // emoji (selecciones) o URL de escudo (clubes); la UI decide por prefijo http
    group: v.string(), // "" en ligas (no hay grupos)
    alive: v.boolean(),
    currentStage: v.string(), // "group" | "r32" | "r16" | "qf" | "sf" | "final" | "champion" | "out" | "league"
    eliminatedAt: v.optional(v.number()),
    externalId: v.string(),
    tournamentCode: v.optional(v.string()), // ausente = "WC" (legacy); ver lib/tournaments.tournamentCodeOf
  })
    .index("by_externalId", ["externalId"])
    .index("by_group", ["group"])
    .index("by_tournament", ["tournamentCode"])
    // El mismo club existe en varios torneos (Real Madrid: CL y PD) como filas
    // separadas, porque alive/currentStage/group son por torneo. La búsqueda por
    // externalId SOLO es única dentro de un torneo.
    .index("by_tournament_externalId", ["tournamentCode", "externalId"]),
```

En `matches` (líneas 18-36), añadir:

```ts
    matchday: v.optional(v.number()), // jornada (liga) — agrupador de Ronda
    tournamentCode: v.optional(v.string()), // ausente = "WC" (legacy)
```

y los índices:

```ts
    .index("by_tournament_kickoff", ["tournamentCode", "kickoffAt"])
    .index("by_tournament_externalId", ["tournamentCode", "externalId"]),
```

En `quinielas` (líneas 38-58), añadir campo:

```ts
    tournamentCode: v.optional(v.string()), // ausente = "WC" (legacy)
```

- [ ] **Step 2: Verify typecheck + codegen**

Run: `npx convex codegen && npx tsc -b`
Expected: sin errores (los campos son opcionales; ningún caller existente se rompe)

- [ ] **Step 3: Run the full suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS (suite completa actual)

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(torneos): tournamentCode y matchday en schema con índices por torneo"
```

---

### Task 3: Migración backfill a "WC"

**Files:**
- Create: `convex/migrations.ts`
- Test: `convex/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/migrations.test.ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

describe("backfillTournamentCode", () => {
  it("marca WC en filas legacy y respeta filas ya marcadas", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      await ctx.db.insert("teams", {
        code: "MEX", name: "México", flag: "🇲🇽", group: "A",
        alive: true, currentStage: "group", externalId: "t1",
      });
      await ctx.db.insert("teams", {
        code: "RMA", name: "Real Madrid", flag: "https://crest", group: "",
        alive: true, currentStage: "league", externalId: "t2", tournamentCode: "PD",
      });
      await ctx.db.insert("matches", {
        stage: "group", kickoffAt: 1, status: "scheduled", externalId: "m1",
      });
      await ctx.db.insert("quinielas", {
        name: "Legacy", prizeText: "", numParticipants: 4, slotSizes: [12, 12, 12, 12],
        adminToken: "a", joinToken: "j", status: "open", createdAt: 1,
      });
    });

    await t.mutation(internal.migrations.backfillTournamentCode, {});

    await t.run(async (ctx) => {
      const teams = await ctx.db.query("teams").collect();
      expect(teams.find((x) => x.externalId === "t1")?.tournamentCode).toBe("WC");
      expect(teams.find((x) => x.externalId === "t2")?.tournamentCode).toBe("PD");
      const [match] = await ctx.db.query("matches").collect();
      expect(match.tournamentCode).toBe("WC");
      const [qn] = await ctx.db.query("quinielas").collect();
      expect(qn.tournamentCode).toBe("WC");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/migrations.test.ts`
Expected: FAIL — `migrations` no existe en `internal`

- [ ] **Step 3: Write the implementation**

```ts
// convex/migrations.ts
import { internalMutation } from "./_generated/server";

// Backfill puntual post multi-torneo: toda fila sin tournamentCode es del
// Mundial (la app era mono-torneo). Idempotente: solo patchea las que faltan.
// Ejecutar una vez tras desplegar el schema: npx convex run migrations:backfillTournamentCode --prod
export const backfillTournamentCode = internalMutation({
  args: {},
  handler: async (ctx) => {
    let patched = 0;
    for (const table of ["teams", "matches", "quinielas"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        if (row.tournamentCode === undefined) {
          await ctx.db.patch(row._id, { tournamentCode: "WC" });
          patched++;
        }
      }
    }
    return { patched };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/migrations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/migrations.ts convex/migrations.test.ts
git commit -m "feat(torneos): migración backfill de tournamentCode a WC"
```

---

### Task 4: footballData parametrizado — competición, `matchday`, `REGULAR_SEASON` y `fetchTeams`

**Files:**
- Modify: `convex/lib/footballData.ts`
- Test: `convex/lib/footballData.test.ts` (ya existe; añadir casos)

- [ ] **Step 1: Write the failing tests**

Añadir a `convex/lib/footballData.test.ts`:

```ts
import { mapMatches, mapTeams, fetchMatches, fetchTeams } from "./footballData";

describe("multi-torneo", () => {
  it("mapea REGULAR_SEASON a stage league con matchday y sin bracketSlot", () => {
    const out = mapMatches({
      matches: [{
        id: 9, stage: "REGULAR_SEASON", matchday: 24, utcDate: "2026-02-01T15:00:00Z",
        status: "TIMED", homeTeam: { id: 57 }, awayTeam: { id: 65 },
      }],
    });
    expect(out[0]).toMatchObject({ stage: "league", matchday: 24, bracketSlot: null });
  });

  it("mapea matchday null cuando la API no lo trae", () => {
    const out = mapMatches({ matches: [{ id: 1, stage: "GROUP_STAGE", status: "TIMED" }] });
    expect(out[0].matchday).toBeNull();
  });

  it("mapTeams extrae externalId, tla, nombre y escudo", () => {
    const out = mapTeams({
      teams: [{ id: 57, name: "Arsenal FC", tla: "ARS", crest: "https://crests.football-data.org/57.png" }],
    });
    expect(out).toEqual([
      { externalId: "57", name: "Arsenal FC", code: "ARS", crest: "https://crests.football-data.org/57.png" },
    ]);
  });

  it("fetchMatches consulta la URL de la competición pedida", async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ matches: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchMatches("tok", "PL", { fetchFn });
    expect(calls[0]).toBe("https://api.football-data.org/v4/competitions/PL/matches");
  });

  it("fetchTeams consulta /teams de la competición", async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ teams: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchTeams("tok", "PL", { fetchFn });
    expect(calls[0]).toBe("https://api.football-data.org/v4/competitions/PL/teams");
  });
});
```

Nota: si los tests existentes llaman `fetchMatches(token)` sin competición, actualízalos a `fetchMatches(token, "WC")`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex/lib/footballData.test.ts`
Expected: FAIL — `matchday` no existe en ApiMatch, `mapTeams`/`fetchTeams` no exportados

- [ ] **Step 3: Implement**

En `convex/lib/footballData.ts`:

1. Añadir al mapa `STAGE` (línea 3): `REGULAR_SEASON: "league", PLAYOFFS: "r16"`.
2. `ApiMatch` (línea 19): añadir `matchday: number | null;`.
3. `RawMatch` (línea 33): añadir `matchday?: number | null;`.
4. En `mapMatches` (línea 50): el default de stage pasa a depender del payload — `const stage = (m.stage ? STAGE[m.stage] : undefined) ?? "group";` se mantiene, y `bracketSlot` solo se numera si `stage !== "group" && stage !== "league"`. Añadir al objeto retornado: `matchday: m.matchday ?? null,`.
5. Reemplazar la constante de URL y la firma de fetch:

```ts
const matchesUrl = (code: string) =>
  `https://api.football-data.org/v4/competitions/${code}/matches`;
const teamsUrl = (code: string) =>
  `https://api.football-data.org/v4/competitions/${code}/teams`;

export type ApiTeam = { externalId: string; name: string; code: string; crest: string };

type RawApiTeam = { id: number | string; name?: string; tla?: string; crest?: string };

export function mapTeams(json: { teams?: RawApiTeam[] }): ApiTeam[] {
  return (json.teams ?? []).map((t) => ({
    externalId: String(t.id),
    name: t.name ?? "",
    code: t.tla ?? "",
    crest: t.crest ?? "",
  }));
}

async function fetchJson(url: string, token: string, deps: FetchDeps): Promise<unknown> {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const request = () => fetchFn(url, { headers: { "X-Auth-Token": token } });
  let res = await request();
  if (res.status === 429) {
    await sleep(retryAfterMs(res.headers.get("Retry-After")));
    res = await request();
  }
  if (!res.ok) throw new Error(`football-data ${res.status}`);
  return res.json();
}

export async function fetchMatches(token: string, competitionCode: string, deps: FetchDeps = {}): Promise<ApiMatch[]> {
  return mapMatches((await fetchJson(matchesUrl(competitionCode), token, deps)) as RawResponse);
}

export async function fetchTeams(token: string, competitionCode: string, deps: FetchDeps = {}): Promise<ApiTeam[]> {
  return mapTeams((await fetchJson(teamsUrl(competitionCode), token, deps)) as { teams?: RawApiTeam[] });
}
```

(El retry-429 existente se conserva dentro de `fetchJson`; borrar la versión vieja de `fetchMatches` y `WC_MATCHES_URL`.)

- [ ] **Step 4: Run tests + suite**

Run: `npx vitest run convex/lib/footballData.test.ts && npx tsc -b`
Expected: PASS / `sync.ts` falla typecheck por la firma nueva — actualizar la llamada en el Step 5

- [ ] **Step 5: Arreglar el caller actual**

En `convex/sync.ts` línea 17: `const matches = await fetchMatches(token, "WC");` (parche temporal; Task 6 lo reescribe).

Run: `npx tsc -b && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add convex/lib/footballData.ts convex/lib/footballData.test.ts convex/sync.ts
git commit -m "feat(torneos): footballData por competición con matchday, league y fetchTeams"
```

---

### Task 5: Upserts scoped por torneo (`matches.ts`)

**Files:**
- Modify: `convex/matches.ts`
- Test: `convex/matches.test.ts` (añadir describe nuevo)

- [ ] **Step 1: Write the failing tests**

```ts
// convex/matches.test.ts — añadir
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

describe("multi-torneo", () => {
  it("upsertTeam crea el equipo en su torneo y es idempotente", async () => {
    const t = convexTest(schema);
    const team = { externalId: "57", name: "Arsenal FC", code: "ARS", crest: "https://c/57.png" };
    await t.mutation(internal.matches.upsertTeam, { team, tournamentCode: "PL", format: "liga" });
    await t.mutation(internal.matches.upsertTeam, { team, tournamentCode: "PL", format: "liga" });
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("teams").collect();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tournamentCode: "PL", flag: "https://c/57.png", group: "", currentStage: "league", alive: true,
      });
    });
  });

  it("el mismo club en dos torneos produce dos filas", async () => {
    const t = convexTest(schema);
    const team = { externalId: "86", name: "Real Madrid", code: "RMA", crest: "https://c/86.png" };
    await t.mutation(internal.matches.upsertTeam, { team, tournamentCode: "PD", format: "liga" });
    await t.mutation(internal.matches.upsertTeam, { team, tournamentCode: "CL", format: "eliminatorio" });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("teams").collect()).toHaveLength(2);
    });
  });

  it("upsertMatchResult resuelve equipos dentro del torneo y guarda matchday", async () => {
    const t = convexTest(schema);
    for (const [code, ext] of [["PL", "57"], ["PL", "65"], ["PD", "57"]] as const) {
      await t.mutation(internal.matches.upsertTeam, {
        team: { externalId: ext, name: ext, code: ext, crest: "" }, tournamentCode: code, format: "liga",
      });
    }
    await t.mutation(internal.matches.upsertMatchResult, {
      tournamentCode: "PL",
      match: {
        externalId: "m1", stage: "league", group: null, matchday: 24,
        homeExternalId: "57", awayExternalId: "65", kickoffAt: 100,
        homeScore: null, awayScore: null, status: "scheduled",
        winnerExternalId: null, bracketSlot: null,
      },
    });
    await t.run(async (ctx) => {
      const [mt] = await ctx.db.query("matches").collect();
      expect(mt).toMatchObject({ tournamentCode: "PL", matchday: 24 });
      const home = await ctx.db.get(mt.homeTeamId!);
      expect(home?.tournamentCode).toBe("PL"); // no el Real Madrid de PD
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run convex/matches.test.ts`
Expected: FAIL — `upsertTeam` no existe; `upsertMatchResult` no acepta `tournamentCode`/`matchday`

- [ ] **Step 3: Implement in `convex/matches.ts`**

1. `apiMatch` validator (línea 7): añadir `matchday: v.union(v.number(), v.null()),`.
2. `teamIdByExternal` pasa a exigir torneo:

```ts
async function teamIdByExternal(ctx: MutationCtx, tournamentCode: string, ext: string | null): Promise<Id<"teams"> | undefined> {
  if (!ext) return undefined;
  const t = await ctx.db.query("teams")
    .withIndex("by_tournament_externalId", (q) => q.eq("tournamentCode", tournamentCode).eq("externalId", ext))
    .first();
  // Fallback legacy: filas WC pre-backfill no tienen tournamentCode aún.
  if (t) return t._id;
  if (tournamentCode !== "WC") return undefined;
  const legacy = await ctx.db.query("teams").withIndex("by_externalId", (q) => q.eq("externalId", ext)).first();
  return legacy && legacy.tournamentCode === undefined ? legacy._id : undefined;
}
```

3. Nueva mutation `upsertTeam`:

```ts
export const upsertTeam = internalMutation({
  args: {
    tournamentCode: v.string(),
    format: v.union(v.literal("eliminatorio"), v.literal("liga")),
    team: v.object({ externalId: v.string(), name: v.string(), code: v.string(), crest: v.string() }),
  },
  handler: async (ctx, { tournamentCode, format, team }) => {
    const existing = await ctx.db.query("teams")
      .withIndex("by_tournament_externalId", (q) => q.eq("tournamentCode", tournamentCode).eq("externalId", team.externalId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { name: team.name, code: team.code, flag: team.crest });
      return;
    }
    await ctx.db.insert("teams", {
      code: team.code, name: team.name, flag: team.crest,
      group: "", // los eliminatorios reciben grupo desde sus partidos de grupos (abajo)
      alive: true,
      currentStage: format === "liga" ? "league" : "group",
      externalId: team.externalId, tournamentCode,
    });
  },
});
```

4. `upsertMatchResult`: args pasan a `{ tournamentCode: v.string(), match: apiMatch }`; las dos llamadas a `teamIdByExternal` reciben `tournamentCode`; `fields` añade `tournamentCode` y `matchday: match.matchday ?? undefined`; la búsqueda de `existing` usa `by_tournament_externalId` con el mismo fallback legacy WC que `teamIdByExternal`. Además, si `match.group` viene y el equipo tiene `group === ""`, patchear el grupo del equipo:

```ts
    if (match.group) {
      for (const tid of [homeTeamId, awayTeamId]) {
        if (!tid) continue;
        const tm = await ctx.db.get(tid);
        if (tm && tm.group === "") await ctx.db.patch(tid, { group: match.group });
      }
    }
```

5. `recomputeTeamStates`: args pasan a `{ tournamentCode: v.string() }`; solo aplica a eliminatorios — si `tournamentByCode(args.tournamentCode)?.format !== "eliminatorio"`, return temprano. teams y matches se cargan con `.withIndex("by_tournament", …)` / `.withIndex("by_tournament_kickoff", …)` y, para `"WC"`, se concatenan las filas legacy sin código (mismo fallback). Import: `import { tournamentByCode } from "./lib/tournaments";`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run convex/matches.test.ts && npx tsc -b`
Expected: PASS en matches.test; `sync.ts` roto por firmas — siguiente task lo reescribe; parche mínimo para typecheck: pasar `tournamentCode: "WC"` en las llamadas de `sync.ts`.

- [ ] **Step 5: Commit**

```bash
git add convex/matches.ts convex/matches.test.ts convex/sync.ts
git commit -m "feat(torneos): upserts de equipos y partidos scoped por torneo"
```

---

### Task 6: Sync de torneos activos + `tournaments.prepare`/`list`

**Files:**
- Modify: `convex/sync.ts`
- Create: `convex/tournaments.ts`
- Test: `convex/sync.test.ts`, `convex/tournaments.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// convex/tournaments.test.ts
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

describe("tournaments.list", () => {
  it("devuelve el catálogo con teamCount y modos permitidos", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.matches.upsertTeam, {
      team: { externalId: "57", name: "Arsenal", code: "ARS", crest: "" },
      tournamentCode: "PL", format: "liga",
    });
    const list = await t.query(api.tournaments.list, {});
    const pl = list.find((x) => x.code === "PL")!;
    expect(pl).toMatchObject({ format: "liga", teamCount: 1, allowedModes: ["progol"] });
    const wc = list.find((x) => x.code === "WC")!;
    expect(wc.allowedModes).toEqual(["clasica", "progol"]);
  });
});

describe("activeTournamentCodes", () => {
  it("solo lista torneos de quinielas no finalizadas, sin duplicados", async () => {
    const t = convexTest(schema);
    await t.run(async (ctx) => {
      const base = { name: "q", prizeText: "", numParticipants: 0, slotSizes: [], status: "open", createdAt: 1 };
      await ctx.db.insert("quinielas", { ...base, adminToken: "a1", joinToken: "j1", tournamentCode: "PL" });
      await ctx.db.insert("quinielas", { ...base, adminToken: "a2", joinToken: "j2", tournamentCode: "PL" });
      await ctx.db.insert("quinielas", { ...base, adminToken: "a3", joinToken: "j3" }); // legacy = WC
      await ctx.db.insert("quinielas", { ...base, adminToken: "a4", joinToken: "j4", tournamentCode: "SA", status: "finished" });
    });
    const codes = await t.query(internal.tournaments.activeTournamentCodes, {});
    expect([...codes].sort()).toEqual(["PL", "WC"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/tournaments.test.ts`
Expected: FAIL — módulo `tournaments` no existe

- [ ] **Step 3: Implement `convex/tournaments.ts`**

```ts
// convex/tournaments.ts
import { internalQuery, query, action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { TOURNAMENTS, allowedGameModes, tournamentByCode, tournamentCodeOf } from "./lib/tournaments";

declare const process: { env: Record<string, string | undefined> };

/** Catálogo + estado de datos, para el selector del formulario de creación. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").collect();
    const countByCode = new Map<string, number>();
    for (const tm of teams) {
      const code = tournamentCodeOf(tm);
      countByCode.set(code, (countByCode.get(code) ?? 0) + 1);
    }
    return TOURNAMENTS.map((t) => ({
      code: t.code, name: t.name, shortName: t.shortName, format: t.format,
      allowedModes: allowedGameModes(t.format),
      teamCount: countByCode.get(t.code) ?? 0,
    }));
  },
});

/** Torneos referidos por quinielas vivas: lo único que el cron sincroniza (ADR-0001). */
export const activeTournamentCodes = internalQuery({
  args: {},
  handler: async (ctx) => {
    const codes = new Set<string>();
    for (const status of ["open", "locked"] as const) {
      const rows = await ctx.db.query("quinielas").withIndex("by_status", (q) => q.eq("status", status)).collect();
      for (const qn of rows) codes.add(tournamentCodeOf(qn));
    }
    return [...codes];
  },
});

/** Sync inicial on-demand: el formulario de creación lo invoca al elegir torneo
 *  sin datos, para que Clásica pueda repartir y Progol tenga partidos. */
export const prepare = action({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<{ teamCount: number }> => {
    if (!tournamentByCode(code)) throw new Error("Torneo fuera del catálogo");
    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) throw new Error("missing FOOTBALL_DATA_TOKEN");
    await ctx.runAction(internal.sync.syncTournament, { code, withTeams: true });
    const listed = await ctx.runQuery(api.tournaments.list, {});
    return { teamCount: listed.find((t) => t.code === code)?.teamCount ?? 0 };
  },
});
```

- [ ] **Step 4: Rewrite `convex/sync.ts`**

```ts
// convex/sync.ts
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { fetchMatches, fetchTeams } from "./lib/footballData";
import { tournamentByCode } from "./lib/tournaments";

declare const process: { env: Record<string, string | undefined> };

// Free tier: 10 llamadas/min. Entre torneos esperamos 6.5s para nunca rebasarlo
// aunque el ciclo sincronice los 12 del catálogo.
const SPACING_MS = 6_500;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Sincroniza UN torneo: equipos (opcional) + partidos + estados + cierres + avisos. */
export const syncTournament = internalAction({
  args: { code: v.string(), withTeams: v.optional(v.boolean()) },
  handler: async (ctx, { code, withTeams }): Promise<{ ok: boolean; error?: string }> => {
    const tournament = tournamentByCode(code);
    if (!tournament) return { ok: false, error: `torneo desconocido: ${code}` };
    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) return { ok: false, error: "missing FOOTBALL_DATA_TOKEN" };
    try {
      if (withTeams) {
        const teams = await fetchTeams(token, code);
        for (const team of teams) {
          await ctx.runMutation(internal.matches.upsertTeam, {
            team, tournamentCode: code, format: tournament.format,
          });
        }
      }
      const matches = await fetchMatches(token, code);
      for (const match of matches) {
        await ctx.runMutation(internal.matches.upsertMatchResult, { tournamentCode: code, match });
      }
      await ctx.runMutation(internal.matches.recomputeTeamStates, { tournamentCode: code });
      await ctx.runMutation(internal.quinielas.autoCloseDue, {});
      await ctx.runMutation(internal.notifications.detectFromSync, {});
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e instanceof Error ? e.message : e) };
    }
  },
});

/** Entrada del cron: recorre los torneos con quinielas vivas, espaciado. */
export const syncMatches = internalAction({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; synced: string[] }> => {
    const codes = await ctx.runQuery(internal.tournaments.activeTournamentCodes, {});
    const synced: string[] = [];
    for (const [i, code] of codes.entries()) {
      if (i > 0) await sleep(SPACING_MS);
      const res = await ctx.runAction(internal.sync.syncTournament, { code });
      if (res.ok) synced.push(code);
    }
    return { ok: true, synced };
  },
});
```

Actualizar el nombre del cron en `convex/crons.ts`:

```ts
crons.interval("sync active tournaments", { minutes: 5 }, internal.sync.syncMatches, {});
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run convex/tournaments.test.ts && npx tsc -b && npx vitest run`
Expected: PASS completo (los tests existentes de sync, si stubean fetch, ajustan la firma)

- [ ] **Step 6: Commit**

```bash
git add convex/sync.ts convex/tournaments.ts convex/tournaments.test.ts convex/crons.ts
git commit -m "feat(torneos): sync de torneos activos con prepare on-demand y catálogo público"
```

---

### Task 7: `resolveQuiniela` y ciclo de vida scoped por torneo

Esta es la tarea de aislamiento crítica: ninguna quiniela debe "ver" equipos/partidos de otro torneo.

**Files:**
- Modify: `convex/lib/perQuiniela.ts`, `convex/quinielas.ts`
- Test: `convex/quinielas.test.ts` (añadir describe)

- [ ] **Step 1: Write the failing tests**

```ts
// convex/quinielas.test.ts — añadir
describe("aislamiento por torneo", () => {
  async function seedTwoTournaments(t: ReturnType<typeof convexTest>) {
    await t.mutation(internal.matches.upsertTeam, {
      team: { externalId: "57", name: "Arsenal", code: "ARS", crest: "" }, tournamentCode: "PL", format: "liga",
    });
    await t.mutation(internal.matches.upsertTeam, {
      team: { externalId: "1", name: "México", code: "MEX", crest: "🇲🇽" }, tournamentCode: "WC", format: "eliminatorio",
    });
  }

  it("createQuiniela clásica rechaza torneos de liga", async () => {
    const t = convexTest(schema);
    await seedTwoTournaments(t);
    await expect(
      t.mutation(api.quinielas.createQuiniela, {
        name: "Liga clásica", prizeText: "x", numParticipants: 4,
        gameMode: "clasica", tournamentCode: "PL",
      }),
    ).rejects.toThrow(/no admite Clásica/);
  });

  it("createQuiniela rechaza torneos sin datos", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(api.quinielas.createQuiniela, {
        name: "Sin datos", prizeText: "x", numParticipants: 0,
        gameMode: "progol", tournamentCode: "SA",
      }),
    ).rejects.toThrow(/sin datos/);
  });

  it("clásica calcula slots con los equipos DEL torneo (no 48 fijos)", async () => {
    const t = convexTest(schema);
    // WC con solo 4 equipos sembrados: 2 participantes → 2 equipos cada uno
    for (const ext of ["1", "2", "3", "4"]) {
      await t.mutation(internal.matches.upsertTeam, {
        team: { externalId: ext, name: ext, code: ext, crest: "" }, tournamentCode: "WC", format: "eliminatorio",
      });
    }
    const res = await t.mutation(api.quinielas.createQuiniela, {
      name: "Mini", prizeText: "x", numParticipants: 2, gameMode: "clasica", tournamentCode: "WC",
    });
    await t.run(async (ctx) => {
      const qn = (await ctx.db.query("quinielas").collect()).find((q) => q.adminToken === res.adminToken)!;
      expect(qn.slotSizes.reduce((a, b) => a + b, 0)).toBe(4);
      expect(qn.tournamentCode).toBe("WC");
    });
  });

  it("resolveQuiniela de una quiniela PL no ve equipos del Mundial", async () => {
    const t = convexTest(schema);
    await seedTwoTournaments(t);
    const res = await t.mutation(api.quinielas.createQuiniela, {
      name: "Premier", prizeText: "x", numParticipants: 0, gameMode: "progol", tournamentCode: "PL",
    });
    await t.run(async (ctx) => {
      const qn = (await ctx.db.query("quinielas").collect()).find((q) => q.adminToken === res.adminToken)!;
      const { resolveQuiniela } = await import("./lib/perQuiniela");
      const resolved = await resolveQuiniela(ctx, qn._id);
      expect(resolved.teams).toHaveLength(1);
      expect(resolved.teams[0].name).toBe("Arsenal");
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/quinielas.test.ts`
Expected: FAIL — `createQuiniela` no acepta `tournamentCode`; resolve ve ambos torneos

- [ ] **Step 3: Implement scoping en `convex/lib/perQuiniela.ts`**

Reemplazar las dos primeras queries de `resolveQuiniela` (líneas 33-34):

```ts
  const qn = await ctx.db.get(quinielaId);
  if (!qn) throw new Error("Quiniela no encontrada");
  const code = tournamentCodeOf(qn);
  const format = tournamentByCode(code)?.format ?? "eliminatorio";
  // Filtro en memoria (≈600 filas máx en el free tier) con normalización legacy;
  // si el volumen crece, cambiar a withIndex("by_tournament").
  const teams = (await ctx.db.query("teams").collect()).filter((t) => tournamentCodeOf(t) === code);
  const matches = (await ctx.db.query("matches").collect()).filter((m) => tournamentCodeOf(m) === code);
```

con import `import { tournamentByCode, tournamentCodeOf } from "./tournaments";`. Para ligas no hay eliminación: tras calcular `effRows`,

```ts
  const states = format === "eliminatorio"
    ? computeTeamStates(teamRows, effRows)
    : new Map(teamRows.map((t) => [t._id, { alive: true, currentStage: "league", eliminatedAt: undefined } as TeamState]));
  const champion = format === "eliminatorio" ? championTeamId(states) : null;
```

y añadir `format` y `tournamentCode: code` al tipo `Resolved` y al objeto retornado (los callers nuevos los usan).

- [ ] **Step 4: Implement en `convex/quinielas.ts`**

`createQuiniela`: añadir arg `tournamentCode: v.optional(v.string())` y al inicio del handler:

```ts
    const code = args.tournamentCode ?? "WC";
    const tournament = tournamentByCode(code);
    if (!tournament) throw new Error("Torneo fuera del catálogo");
    const isProgol = args.gameMode === "progol";
    if (!isProgol && tournament.format !== "eliminatorio")
      throw new Error(`${tournament.name} no admite Clásica (solo Progol)`);
    const teamCount = (await ctx.db.query("teams").collect())
      .filter((t) => tournamentCodeOf(t) === code).length;
    if (teamCount === 0) throw new Error("Torneo sin datos; prepáralo primero");
    const n = isProgol ? 0 : Math.max(1, Math.min(teamCount, Math.floor(args.numParticipants)));
    const slotSizes = isProgol ? [] : shuffleInPlace(computeSlotSizes(n, teamCount), Math.random);
```

(borra las líneas 76-77 actuales que asumen 48) y añadir `tournamentCode: code` al `ctx.db.insert`. Import de `tournamentByCode, tournamentCodeOf` desde `./lib/tournaments`.

`redistributeAndLock` (línea 26): `allTeams` se filtra por torneo de `qn`:

```ts
  const allTeams = (await ctx.db.query("teams").collect())
    .filter((t) => tournamentCodeOf(t) === tournamentCodeOf(qn));
```

`autoCloseDue` (línea 134): el "primer partido" es POR TORNEO de cada quiniela:

```ts
  handler: async (ctx) => {
    const open = await ctx.db.query("quinielas").withIndex("by_status", (q) => q.eq("status", "open")).collect();
    if (open.length === 0) return;
    const allMatches = await ctx.db.query("matches").collect();
    const firstKickoffByCode = new Map<string, number>();
    for (const mt of allMatches) {
      const code = tournamentCodeOf(mt);
      const prev = firstKickoffByCode.get(code);
      if (prev === undefined || mt.kickoffAt < prev) firstKickoffByCode.set(code, mt.kickoffAt);
    }
    for (const qn of open) {
      const first = firstKickoffByCode.get(tournamentCodeOf(qn));
      if (first === undefined || Date.now() < first) continue;
      // …resto del cuerpo actual del for (progol cierra, on_reveal se salta, clásica reparte)
    }
  },
```

- [ ] **Step 5: Run tests + full suite**

Run: `npx vitest run convex/quinielas.test.ts && npx vitest run && npx tsc -b`
Expected: PASS — incluidos todos los tests previos del Mundial (filas legacy sin código siguen resolviendo como WC)

- [ ] **Step 6: Commit**

```bash
git add convex/lib/perQuiniela.ts convex/quinielas.ts convex/quinielas.test.ts
git commit -m "feat(torneos): aislamiento por torneo en resolución, creación y ciclo de vida"
```

---

### Task 8: Standings de liga (módulo puro)

**Files:**
- Create: `convex/lib/standings.ts`
- Test: `convex/lib/standings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/lib/standings.test.ts
import { describe, expect, it } from "vitest";
import { computeLeagueStandings } from "./standings";
import type { MatchRow, TeamRow } from "./tournament";

const team = (id: string): TeamRow => ({ _id: id, group: "" });
const match = (h: string, a: string, hs: number | null, as: number | null, status = "finished"): MatchRow => ({
  _id: `${h}-${a}`, stage: "league", group: null, homeTeamId: h, awayTeamId: a,
  homeScore: hs, awayScore: as, status, winnerTeamId: null, kickoffAt: 0,
});

describe("computeLeagueStandings", () => {
  it("3 puntos por victoria, 1 por empate; ordena por pts, dif, gf", () => {
    const rows = computeLeagueStandings(
      [team("ARS"), team("CHE"), team("LIV")],
      [
        match("ARS", "CHE", 2, 0),  // ARS 3pts (+2), CHE 0
        match("LIV", "ARS", 1, 1),  // LIV 1, ARS 4
        match("CHE", "LIV", 0, 3),  // LIV 4 (+3) — desempata a ARS (+1... no: ARS +2? ver abajo)
      ],
    );
    expect(rows.map((r) => r.teamId)).toEqual(["LIV", "ARS", "CHE"]);
    expect(rows[0]).toMatchObject({ points: 4, gd: 3, gf: 4, played: 2 });
    expect(rows[1]).toMatchObject({ points: 4, gd: 2, gf: 3, played: 2 });
  });

  it("ignora partidos sin terminar y sin marcador", () => {
    const rows = computeLeagueStandings([team("ARS")], [match("ARS", "CHE", null, null, "scheduled")]);
    expect(rows[0]).toMatchObject({ points: 0, played: 0 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/lib/standings.test.ts`
Expected: FAIL — módulo no existe

- [ ] **Step 3: Implement**

```ts
// convex/lib/standings.ts
import type { MatchRow, TeamRow } from "./tournament";

export type LeagueStandingRow = {
  teamId: string; points: number; played: number; gf: number; ga: number; gd: number;
};

/** Tabla de posiciones de liga: 3/1/0, ordenada por pts, diferencia, goles a favor. */
export function computeLeagueStandings(teams: TeamRow[], matches: MatchRow[]): LeagueStandingRow[] {
  const rows = new Map<string, LeagueStandingRow>(
    teams.map((t) => [t._id, { teamId: t._id, points: 0, played: 0, gf: 0, ga: 0, gd: 0 }]),
  );
  for (const m of matches) {
    if (m.status !== "finished" || m.homeScore == null || m.awayScore == null) continue;
    const home = m.homeTeamId ? rows.get(m.homeTeamId) : undefined;
    const away = m.awayTeamId ? rows.get(m.awayTeamId) : undefined;
    if (!home || !away) continue;
    home.played++; away.played++;
    home.gf += m.homeScore; home.ga += m.awayScore;
    away.gf += m.awayScore; away.ga += m.homeScore;
    if (m.homeScore > m.awayScore) home.points += 3;
    else if (m.awayScore > m.homeScore) away.points += 3;
    else { home.points++; away.points++; }
  }
  const out = [...rows.values()];
  for (const r of out) r.gd = r.gf - r.ga;
  return out.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest run convex/lib/standings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/lib/standings.ts convex/lib/standings.test.ts
git commit -m "feat(torneos): tabla de posiciones de liga (módulo puro)"
```

---

### Task 9: `getTorneo` — Vista Torneo adaptativa (backend)

**Files:**
- Modify: `convex/mundial.ts`, `convex/types.ts`
- Test: `convex/mundial.test.ts` (añadir describe)

- [ ] **Step 1: Write the failing test**

```ts
// convex/mundial.test.ts — añadir
describe("getTorneo", () => {
  it("en liga devuelve standings con shortName del torneo", async () => {
    const t = convexTest(schema);
    for (const ext of ["57", "65"]) {
      await t.mutation(internal.matches.upsertTeam, {
        team: { externalId: ext, name: `T${ext}`, code: ext, crest: "" }, tournamentCode: "PL", format: "liga",
      });
    }
    await t.mutation(internal.matches.upsertMatchResult, {
      tournamentCode: "PL",
      match: { externalId: "m1", stage: "league", group: null, matchday: 1,
        homeExternalId: "57", awayExternalId: "65", kickoffAt: 1,
        homeScore: 2, awayScore: 0, status: "finished", winnerExternalId: "57", bracketSlot: null },
    });
    const res = await t.mutation(api.quinielas.createQuiniela, {
      name: "Premier", prizeText: "x", numParticipants: 0, gameMode: "progol", tournamentCode: "PL",
    });
    const qn = await t.run(async (ctx) =>
      (await ctx.db.query("quinielas").collect()).find((q) => q.adminToken === res.adminToken)!);
    const data = await t.query(api.mundial.getTorneo, { quinielaId: qn._id });
    expect(data.kind).toBe("league");
    if (data.kind === "league") {
      expect(data.tournament.shortName).toBe("Premier");
      expect(data.standings[0]).toMatchObject({ points: 3 });
    }
  });

  it("en eliminatorio devuelve grupos y bracket (forma actual)", async () => {
    // sembrar 2 equipos WC + 1 partido de grupos finalizado y asertar kind "brackets"
    // con data.groups no vacío (reusar el seed del describe de getMundial existente).
  });
});
```

(El segundo test se completa reutilizando el helper de seed que ya exista en `convex/mundial.test.ts` para `getMundial`; mismas aserciones que el test actual de grupos pero sobre `getTorneo`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/mundial.test.ts`
Expected: FAIL — `getTorneo` no existe

- [ ] **Step 3: Implement**

En `convex/types.ts` añadir:

```ts
export type TournamentInfo = { code: string; shortName: string; format: "eliminatorio" | "liga" };
export type TorneoData =
  | ({ kind: "brackets"; tournament: TournamentInfo } & MundialData)
  | { kind: "league"; tournament: TournamentInfo;
      standings: { team: TeamLite; points: number; played: number; gd: number; gf: number }[] };
```

En `convex/mundial.ts`: extraer el cuerpo actual de `getMundial` a una función `buildBrackets(ctx, quinielaId)` y añadir:

```ts
export const getTorneo = query({
  args: { quinielaId: v.id("quinielas") },
  handler: async (ctx, { quinielaId }): Promise<TorneoData> => {
    const qn = await ctx.db.get(quinielaId);
    if (!qn) throw new Error("Quiniela no encontrada");
    const code = tournamentCodeOf(qn);
    const t = tournamentByCode(code) ?? { code, shortName: code, format: "eliminatorio" as const };
    const tournament = { code: t.code, shortName: t.shortName, format: t.format };
    if (t.format === "liga") {
      const { teamById, teamRows, effRows } = await resolveQuiniela(ctx, quinielaId);
      const standings = computeLeagueStandings(teamRows, effRows).map((s) => ({
        team: teamLite(teamById.get(s.teamId as Id<"teams">))!,
        points: s.points, played: s.played, gd: s.gd, gf: s.gf,
      }));
      return { kind: "league", tournament, standings };
    }
    return { kind: "brackets", tournament, ...(await buildBrackets(ctx, quinielaId)) };
  },
});

// getMundial queda como alias para clientes viejos:
export const getMundial = query({
  args: { quinielaId: v.id("quinielas") },
  handler: async (ctx, { quinielaId }): Promise<MundialData> => buildBrackets(ctx, quinielaId),
});
```

Imports nuevos: `computeLeagueStandings` de `./lib/standings`, `tournamentByCode, tournamentCodeOf` de `./lib/tournaments`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run convex/mundial.test.ts && npx tsc -b`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/mundial.ts convex/types.ts convex/mundial.test.ts
git commit -m "feat(torneos): getTorneo adaptativo (brackets o standings) con getMundial como alias"
```

---

### Task 10: Cierre de temporada en Progol de liga

En liga no hay "final": la quiniela Progol termina cuando TODOS los partidos del torneo están finalizados.

**Files:**
- Modify: `convex/lib/progol.ts`, `convex/progol.ts`
- Test: `convex/lib/progol.test.ts` (añadir describe)

- [ ] **Step 1: Write the failing test**

```ts
// convex/lib/progol.test.ts — añadir
import { isSeasonDone } from "./progol";

describe("isSeasonDone", () => {
  const m = (stage: string, status: string) => ({ stage, status }) as { stage: string; status: string };
  it("eliminatorio: termina cuando la final está finished", () => {
    expect(isSeasonDone("eliminatorio", [m("group", "finished"), m("final", "finished")])).toBe(true);
    expect(isSeasonDone("eliminatorio", [m("final", "scheduled")])).toBe(false);
  });
  it("liga: termina cuando TODOS los partidos están finished y hay al menos uno", () => {
    expect(isSeasonDone("liga", [m("league", "finished"), m("league", "finished")])).toBe(true);
    expect(isSeasonDone("liga", [m("league", "finished"), m("league", "scheduled")])).toBe(false);
    expect(isSeasonDone("liga", [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/lib/progol.test.ts`
Expected: FAIL — `isSeasonDone` no exportado

- [ ] **Step 3: Implement**

En `convex/lib/progol.ts`:

```ts
/** Fin del torneo para Progol: final jugada (eliminatorio) o calendario completo (liga). */
export function isSeasonDone(
  format: "eliminatorio" | "liga",
  rows: { stage: string; status: string }[],
): boolean {
  if (format === "eliminatorio")
    return rows.some((m) => m.stage === "final" && m.status === "finished");
  return rows.length > 0 && rows.every((m) => m.status === "finished");
}
```

Además, `STAGE_LABEL` gana la etiqueta de liga: `league: "Jornada"` (el label final por jornada se arma en buildCard, Task 11).

En `convex/progol.ts` reemplazar las DOS apariciones de
`const finalDone = effRows.some((mt) => mt.stage === "final" && mt.status === "finished");`
(en `getGeneral` línea 54 y en `buildCard` línea 107) por:

```ts
    const finalDone = isSeasonDone(format, effRows);
```

usando el `format` que ahora devuelve `resolveQuiniela` (Task 7). Import: añadir `isSeasonDone` al import de `./lib/progol`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run convex/lib/progol.test.ts convex/progol.test.ts && npx tsc -b`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/lib/progol.ts convex/progol.ts convex/lib/progol.test.ts
git commit -m "feat(torneos): cierre de temporada de Progol por formato (final o calendario completo)"
```

---

### Task 11: Progol por Ronda (backend) — agrupar por jornada en liga

**Files:**
- Modify: `convex/progol.ts`, `convex/types.ts`
- Test: `convex/progol.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/progol.test.ts — añadir
it("en liga, la tarjeta agrupa por jornada y reporta la ronda actual", async () => {
  const t = convexTest(schema);
  // seed PL: 2 equipos, jornada 1 finalizada y jornada 2 programada
  for (const ext of ["57", "65"]) {
    await t.mutation(internal.matches.upsertTeam, {
      team: { externalId: ext, name: `T${ext}`, code: ext, crest: "" }, tournamentCode: "PL", format: "liga",
    });
  }
  const base = { group: null, homeExternalId: "57", awayExternalId: "65", winnerExternalId: null, bracketSlot: null };
  await t.mutation(internal.matches.upsertMatchResult, { tournamentCode: "PL", match: {
    ...base, externalId: "m1", stage: "league", matchday: 1, kickoffAt: 1, homeScore: 1, awayScore: 0, status: "finished" } });
  await t.mutation(internal.matches.upsertMatchResult, { tournamentCode: "PL", match: {
    ...base, externalId: "m2", stage: "league", matchday: 2, kickoffAt: Date.now() + 86_400_000,
    homeScore: null, awayScore: null, status: "scheduled" } });

  const created = await t.mutation(api.quinielas.createQuiniela, {
    name: "PL", prizeText: "x", numParticipants: 0, gameMode: "progol", tournamentCode: "PL",
  });
  const joined = await t.mutation(api.participants.joinQuiniela, {
    joinToken: created.joinToken, name: "Ana",
  });
  const card = await t.query(api.progol.getPersonal, { personalToken: joined.personalToken });
  const labels = card.stages.map((s) => s.label);
  expect(labels).toEqual(["Jornada 1", "Jornada 2"]);
  expect(card.currentRonda).toBe("Jornada 2"); // primera ronda con partidos sin terminar
});
```

(Ajustar nombres de campos al payload real de `getPersonal` — el describe existente de progol.test.ts muestra la forma exacta; `stages` es la lista agrupada que hoy sale `byStage`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run convex/progol.test.ts`
Expected: FAIL — agrupa todo bajo "league" y no existe `currentRonda`

- [ ] **Step 3: Implement en `buildCard` (convex/progol.ts)**

En el loop de agrupación (línea 108-120), la clave y label de grupo pasan a ser por Ronda:

```ts
  const byRonda = new Map<string, ProgolMatchView[]>();
  const rondaKey = (mt: { stage: string; matchday?: number | null }) =>
    mt.stage === "league" ? `j${mt.matchday ?? 0}` : mt.stage;
  const rondaLabel = (mt: { stage: string; matchday?: number | null }) =>
    mt.stage === "league" ? `Jornada ${mt.matchday ?? "?"}` : (STAGE_LABEL[mt.stage] ?? mt.stage);
```

`ProgolMatchView` (types.ts) añade `matchday: number | null`. `effectiveMatches`/`MatchRow` deben propagar `matchday` (en `convex/lib/tournament.ts` añadir `matchday?: number | null` a `MatchRow`, y en `resolveQuiniela` copiarlo al construir `matchRows`). El payload del card añade:

```ts
  currentRonda: /* label de la primera ronda (en orden de kickoff) con algún partido sin finished; si todas terminaron, la última */
```

calculado tras armar `byRonda` recorriendo las entradas en orden de inserción (ya están ordenadas por kickoff).

- [ ] **Step 4: Run tests + suite**

Run: `npx vitest run convex/progol.test.ts && npx vitest run && npx tsc -b`
Expected: PASS (las quinielas WC siguen agrupando por etapa, mismas labels que hoy)

- [ ] **Step 5: Commit**

```bash
git add convex/progol.ts convex/types.ts convex/lib/tournament.ts convex/lib/perQuiniela.ts
git commit -m "feat(torneos): tarjeta Progol agrupada por Ronda con ronda actual"
```

---

### Task 12: Web — selector de torneo en `Home.tsx`

**Files:**
- Modify: `src/routes/Home.tsx`

- [ ] **Step 1: Implement el selector**

En `src/routes/Home.tsx`:

1. Imports nuevos: `import { useQuery, useAction } from "convex/react";` (useMutation ya está).
2. Estado nuevo: `const [tournamentCode, setTournamentCode] = useState("WC");` y datos: `const tournaments = useQuery(api.tournaments.list, {}) ?? [];` y `const prepare = useAction(api.tournaments.prepare);`.
3. Derivados (sin setState en effects — regla ESLint del repo):

```tsx
  const tournament = tournaments.find((t) => t.code === tournamentCode);
  const modes = tournament?.allowedModes ?? ["clasica", "progol"];
  const effectiveGameMode = modes.includes(gameMode) ? gameMode : "progol";
  const maxParticipants = tournament?.teamCount || 48;
```

   Usar `effectiveGameMode` donde hoy se usa `gameMode` en el submit y el render (la liga fuerza Progol sin tocar el estado).
4. UI: encima del bloque "Modo de juego", un `<select>`/lista de cards con `tournaments` (name + badge de formato). Al cambiar:

```tsx
  async function selectTournament(code: string) {
    setTournamentCode(code);
    const t = tournaments.find((x) => x.code === code);
    if (t && t.teamCount === 0) {
      setPreparing(true);
      try { await prepare({ code }); } finally { setPreparing(false); }
    }
  }
```

   con `const [preparing, setPreparing] = useState(false);` y el botón de submit `disabled` mientras `preparing`.
5. `submit()` pasa `tournamentCode` y `gameMode: effectiveGameMode` a `create(...)`, y el clamp de `n` usa `maxParticipants`.
6. Textos del hero: `Mundial 2026` → `{tournament?.name ?? "Mundial 2026"}`; el sub del modo Clásica dice `Se reparten los ${tournament?.teamCount ?? 48} equipos…`.

- [ ] **Step 2: Verify manualmente**

Run: `npm run dev` y abrir `http://localhost:5173/`
Expected: selector con 12 torneos; elegir "Premier League" deshabilita Clásica y fuerza Progol; elegirla por primera vez muestra estado "preparando" y luego permite crear.

- [ ] **Step 3: Lint + tests + commit**

Run: `npm run lint && npx vitest run`
Expected: PASS

```bash
git add src/routes/Home.tsx
git commit -m "feat(torneos): selector de torneo en creación con preparación on-demand"
```

---

### Task 13: Web — Vista Torneo adaptativa + alias de ruta + tab dinámico

**Files:**
- Create: `src/components/StandingsView.tsx`
- Modify: `src/routes/Mundial.tsx`, `src/main.tsx`, `src/components/BottomNav.tsx`

- [ ] **Step 1: Crear `StandingsView.tsx`**

```tsx
// src/components/StandingsView.tsx
// Tabla de posiciones de liga (Vista Torneo, formato liga). Misma estética que
// GroupsView: filas con escudo/bandera, pts, dif, gf.
import { TeamFlag } from "@/components/TeamCard"; // extraer si aún no existe (ver Step 2)

type Row = {
  team: { code: string; name: string; flag: string };
  points: number; played: number; gd: number; gf: number;
};

export function StandingsView({ standings }: { standings: Row[] }) {
  return (
    <section className="grain relative overflow-hidden rounded-3xl border border-border bg-card p-4">
      <table className="w-full text-sm">
        <thead className="text-[0.65rem] uppercase tracking-widest text-muted-foreground">
          <tr><th className="w-8 text-left">#</th><th className="text-left">Equipo</th>
            <th className="w-8 text-right">PJ</th><th className="w-8 text-right">Dif</th>
            <th className="w-8 text-right">GF</th><th className="w-10 text-right">Pts</th></tr>
        </thead>
        <tbody>
          {standings.map((r, i) => (
            <tr key={r.team.code} className="border-t border-border/50">
              <td className="py-2 text-muted-foreground">{i + 1}</td>
              <td className="flex items-center gap-2 py-2 font-medium">
                <TeamFlag flag={r.team.flag} name={r.team.name} /> {r.team.name}
              </td>
              <td className="text-right text-muted-foreground">{r.played}</td>
              <td className="text-right">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
              <td className="text-right text-muted-foreground">{r.gf}</td>
              <td className="text-right font-bold">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: `TeamFlag` — banderas emoji vs escudos URL**

Los equipos de clubes traen URL de escudo en `flag` (Task 5). Extraer en `src/components/TeamCard.tsx` un componente compartido y usarlo en TODOS los renders de `team.flag` (TeamCard, GroupsView, BracketView, PlayerRow, DuelRow, PredictMatchRow):

```tsx
export function TeamFlag({ flag, name, className = "" }: { flag: string; name: string; className?: string }) {
  if (flag.startsWith("http"))
    return <img src={flag} alt={name} className={`inline-block size-5 object-contain ${className}`} />;
  return <span className={className}>{flag}</span>;
}
```

- [ ] **Step 3: `Mundial.tsx` adaptativo**

Cambiar la query a `api.mundial.getTorneo`. Render:

```tsx
  if (data.kind === "league") return (
    <Shell>{/* header existente */}<StandingsView standings={data.standings} /></Shell>
  );
  // resto: groups + bracket como hoy (data tiene la misma forma + kind/tournament)
```

El título de la vista usa `data.tournament.shortName`.

- [ ] **Step 4: Alias de ruta y tab**

En `src/main.tsx` (línea 25) añadir junto a la existente:

```tsx
          <Route path="/q/:id/torneo" element={<Mundial />} />
```

En `src/components/BottomNav.tsx`: el tab "Mundial" toma su label de `useQuery(api.quinielas.getMode, …)` — extender `getMode` (convex/quinielas.ts línea 271) para devolver también el torneo:

```ts
    return { gameMode: gameModeOf(qn), tournament: (() => {
      const t = tournamentByCode(tournamentCodeOf(qn));
      return { code: t?.code ?? "WC", shortName: t?.shortName ?? "Mundial", format: t?.format ?? "eliminatorio" };
    })() };
```

y en BottomNav: `label = data?.tournament.shortName ?? "Mundial"`. (BottomNav ya consume getMode para rutear por modo — reusar esa query, no añadir otra.)

- [ ] **Step 5: Verify + lint + commit**

Run: `npm run dev` — quiniela WC se ve idéntica; quiniela PL muestra tabla.
Run: `npm run lint && npx vitest run && npx tsc -b`
Expected: PASS

```bash
git add src/components/StandingsView.tsx src/components/TeamCard.tsx src/routes/Mundial.tsx src/main.tsx src/components/BottomNav.tsx convex/quinielas.ts
git commit -m "feat(torneos): Vista Torneo adaptativa con tabla de liga y tab por torneo"
```

---

### Task 14: Web — Progol por Ronda (navegación por jornada)

**Files:**
- Modify: `src/routes/progol/ProgolPersonal.tsx`

- [ ] **Step 1: Implement la navegación**

`ProgolPersonal` ya renderiza secciones por etapa (`card.stages`). Cambios:

1. Estado: `const [ronda, setRonda] = useState<string | null>(null);` y derivado `const activeRonda = ronda ?? card?.currentRonda ?? null;` (estado derivado, sin useEffect).
2. Si el torneo es liga (`card.stages.length > 6` no — usar `getMode.tournament.format === "liga"` que BottomNav ya consume): renderizar UNA sección a la vez con un navegador:

```tsx
  <div className="flex items-center justify-between">
    <Button variant="ghost" size="icon" disabled={idx === 0} onClick={() => setRonda(labels[idx - 1])}>
      <ChevronLeft />
    </Button>
    <h2 className="font-heading text-lg font-bold">{activeRonda}</h2>
    <Button variant="ghost" size="icon" disabled={idx === labels.length - 1} onClick={() => setRonda(labels[idx + 1])}>
      <ChevronRight />
    </Button>
  </div>
```

   donde `labels = card.stages.map((s) => s.label)` e `idx = labels.indexOf(activeRonda)`. La sección mostrada: `card.stages[idx]` con sus `PredictMatchRow` como hoy.
3. En eliminatorio el render actual (todas las etapas en lista) se conserva tal cual.

- [ ] **Step 2: Verify manual + lint + commit**

Run: `npm run dev` — quiniela PL Progol aterriza en la jornada actual, navegan ◀▶; quiniela WC sin cambios.
Run: `npm run lint && npx vitest run`
Expected: PASS

```bash
git add src/routes/progol/ProgolPersonal.tsx
git commit -m "feat(torneos): navegación por Ronda en el panel Progol de ligas"
```

---

### Task 15: Verificación E2E y despliegue

- [ ] **Step 1: E2E local con Playwright (MCP) sobre `npm run dev`**

Flujo: crear quiniela "Premier League" (fuerza Progol) → unirse con un nombre → pronosticar un partido de la jornada actual → abrir Vista Torneo (tabla) → crear quiniela WC Clásica y verificar que se ve idéntica a producción actual.

- [ ] **Step 2: Suite completa + lint + build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: PASS sin warnings nuevos (ojo memoria: si ESLint truena, revisar que la ruta del error no sea `.claude/worktrees/` de otra sesión)

- [ ] **Step 3: Deploy coordinado (front+back juntos — regla del repo)**

```bash
npx convex deploy
npx convex run migrations:backfillTournamentCode --prod
# verificar: npx convex data quinielas --prod | head  (tournamentCode presente)
# Railway: deploy del front según flujo manual habitual
```

- [ ] **Step 4: Commit final de docs**

Actualizar `README.md` (sección de flujo: mencionar selección de torneo) y commit:

```bash
git add README.md
git commit -m "docs(torneos): README con creación multi-torneo"
```

---

## Self-review checklist (ya aplicado)

- Cobertura: catálogo ✔ schema ✔ backfill ✔ API por competición ✔ upserts scoped ✔ sync activos + prepare ✔ aislamiento resolve/create/close ✔ standings ✔ Vista Torneo ✔ cierre de temporada ✔ Ronda backend+web ✔ selector web ✔ E2E/deploy ✔.
- Riesgo señalado: `notifications.detectFromSync` corre una vez por torneo sincronizado (Task 6) — sus dedupeKeys ya lo hacen idempotente; si en ejecución se detecta cruce de torneos en avisos, el fix es filtrar por `tournamentCodeOf` dentro de detectFromSync siguiendo el patrón de Task 7.
- Tipos: `tournamentCodeOf` vive en `convex/lib/tournaments.ts` y es el ÚNICO punto de normalización legacy; `resolveQuiniela` expone `format` y `tournamentCode` desde Task 7 y Tasks 9-11 los consumen.
