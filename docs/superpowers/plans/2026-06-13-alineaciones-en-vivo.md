# Alineaciones en vivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en la web la alineación (11 inicial + formación + DT + banca) de los partidos que se están jugando ahora dentro del Torneo de la Quiniela.

**Architecture:** Un cron de Convex sondea API-Football (`/fixtures?live=all` + `/fixtures/lineups`) solo cuando hay partidos con `status="live"`, reconcilia por nombre de equipo y cachea el resultado en una tabla `lineups`. La web se suscribe con `useQuery` y se actualiza sola por reactividad. Cero infra nueva; el límite de 100 req/día se respeta con la cadencia (0 llamadas sin partidos vivos; deja de re-pedir una vez confirmado el 11).

**Tech Stack:** Convex (queries/mutations/actions, crons, convex-test), React 19 + Vite + Base UI Dialog, TypeScript, Vitest + Testing Library.

---

## File Structure

- **Create** `convex/lib/apiFootball.ts` — funciones puras (mappers, normalización, reconciliación, `isConfirmed`) + helpers de fetch con manejo de 429. Espejo de `convex/lib/footballData.ts`.
- **Create** `convex/lib/apiFootball.test.ts` — tests unitarios puros de lo anterior (env node, sin pragma).
- **Create** `convex/lib/lineupShape.ts` — validadores Convex (`v.object`) compartidos entre `schema.ts` y `lineups.ts`.
- **Modify** `convex/schema.ts` — nueva tabla `lineups`.
- **Create** `convex/lineups.ts` — `runLineupSync` (núcleo puro), `syncLineups` (internalAction), `upsertLineup` (internalMutation), `liveMatchesNeedingLineup` (internalQuery), `getLiveLineups` (query).
- **Create** `convex/lineups.test.ts` — tests con `convex-test` (env edge-runtime) + tests puros de `runLineupSync`.
- **Modify** `convex/types.ts` — tipos de vista (`LiveLineupsData`, etc.).
- **Modify** `convex/crons.ts` — registrar el cron.
- **Create** `src/components/LiveLineups.tsx` — sección "En vivo" + sheet de alineación (presentacionales, por props).
- **Create** `src/components/LiveLineups.test.tsx` — tests de componente (env jsdom).
- **Modify** `src/routes/Mundial.tsx` — `useQuery(getLiveLineups)` y render de `<LiveLineups>`.

**Comandos de referencia:**
- Un test: `npx vitest run <ruta>`
- Todos: `npm test`
- Lint: `npm run lint`
- Typecheck/build: `npm run build`

---

## Task 1: Normalización de nombres de equipo

**Files:**
- Create: `convex/lib/apiFootball.ts`
- Test: `convex/lib/apiFootball.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/lib/apiFootball.test.ts
import { describe, it, expect } from "vitest";
import { normalizeTeamName } from "./apiFootball";

describe("normalizeTeamName", () => {
  it("baja a minúsculas, quita acentos, puntuación y sufijos de club", () => {
    expect(normalizeTeamName("Atlético Madrid")).toBe("atletico madrid");
    expect(normalizeTeamName("Manchester City FC")).toBe("manchester city");
    expect(normalizeTeamName("A.F.C. Bournemouth")).toBe("bournemouth");
  });
  it("aplica alias curados", () => {
    expect(normalizeTeamName("Man City")).toBe("manchester city");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/apiFootball.test.ts`
Expected: FAIL — `normalizeTeamName is not a function` / módulo no encontrado.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/lib/apiFootball.ts
// Integración con API-Football (api-sports.io v3) para alineaciones en vivo.
// Espejo de lib/footballData.ts: mappers puros + helpers de fetch con FetchDeps.

// Alias curados para nombres que la normalización no reconcilia sola.
// Clave y valor se comparan YA normalizados (sin sufijo/acentos/puntuación).
const TEAM_ALIASES: Record<string, string> = {
  "man city": "manchester city",
  "man united": "manchester united",
  "man utd": "manchester united",
};

const CLUB_SUFFIXES = /\b(fc|cf|afc|sc|ac|cd|ssc|rc)\b/g;

/** Normaliza un nombre de equipo para comparar entre proveedores. */
export function normalizeTeamName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos
    .replace(/[.\-_']/g, " ")
    .replace(CLUB_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
  return TEAM_ALIASES[base] ?? base;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/apiFootball.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/lib/apiFootball.ts convex/lib/apiFootball.test.ts
git commit -m "feat(lineups): normalizeTeamName + alias de equipos"
```

---

## Task 2: Mappers de fixtures y alineaciones

**Files:**
- Modify: `convex/lib/apiFootball.ts`
- Test: `convex/lib/apiFootball.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// añadir a convex/lib/apiFootball.test.ts
import {
  mapLiveFixtures, mapLineups, orientLineups, isConfirmed,
} from "./apiFootball";

describe("mapLiveFixtures", () => {
  it("extrae fixtureId, nombres e ids de ambos equipos", () => {
    const out = mapLiveFixtures({ response: [{
      fixture: { id: 215662 },
      teams: { home: { id: 50, name: "Manchester City" }, away: { id: 42, name: "Arsenal" } },
    }] });
    expect(out).toEqual([{ fixtureId: 215662, homeApiId: 50, awayApiId: 42, homeName: "Manchester City", awayName: "Arsenal" }]);
  });
  it("tolera response ausente", () => {
    expect(mapLiveFixtures({})).toEqual([]);
  });
});

describe("mapLineups", () => {
  it("mapea formación, DT, 11 y banca por equipo", () => {
    const out = mapLineups({ response: [
      { team: { id: 50, name: "Manchester City" }, formation: "4-3-3", coach: { name: "Guardiola" },
        startXI: [{ player: { name: "Ederson", number: 31, pos: "G", grid: "1:1" } }],
        substitutes: [{ player: { name: "Ortega", number: 18, pos: "G", grid: null } }] },
      { team: { id: 42, name: "Arsenal" }, formation: "4-3-3", coach: { name: "Arteta" }, startXI: [], substitutes: [] },
    ] });
    expect(out[0]).toEqual({
      apiTeamId: 50, name: "Manchester City", formation: "4-3-3", coach: "Guardiola",
      startXI: [{ name: "Ederson", number: 31, pos: "G", grid: "1:1" }],
      bench: [{ name: "Ortega", number: 18, pos: "G" }],
    });
    expect(out[1].startXI).toEqual([]);
  });
  it("tolera campos ausentes (lineup aún no publicado)", () => {
    const out = mapLineups({ response: [{ team: { id: 1, name: "X" } }] });
    expect(out[0]).toEqual({ apiTeamId: 1, name: "X", formation: "", coach: "", startXI: [], bench: [] });
  });
});

describe("orientLineups", () => {
  const teams = [
    { apiTeamId: 42, name: "Arsenal", formation: "4-3-3", coach: "Arteta", startXI: [{ name: "Raya" }], bench: [] },
    { apiTeamId: 50, name: "Man City", formation: "4-3-3", coach: "Pep", startXI: [{ name: "Ederson" }], bench: [] },
  ];
  it("asigna home/away según los ids del fixture, sin importar el orden", () => {
    const { home, away } = orientLineups(teams, { fixtureId: 1, homeApiId: 50, awayApiId: 42, homeName: "", awayName: "" });
    expect(home.name).toBe("Man City");
    expect(away.name).toBe("Arsenal");
    expect("apiTeamId" in home).toBe(false); // se descarta para almacenar
  });
  it("cae a orden de array si los ids no casan", () => {
    const { home, away } = orientLineups(teams, { fixtureId: 1, homeApiId: 999, awayApiId: 888, homeName: "", awayName: "" });
    expect(home.name).toBe("Arsenal");
    expect(away.name).toBe("Man City");
  });
});

describe("isConfirmed", () => {
  it("confirmado solo si ambos equipos tienen 11 inicial", () => {
    const full = { name: "", formation: "", coach: "", startXI: [{ name: "p" }], bench: [] };
    const empty = { name: "", formation: "", coach: "", startXI: [], bench: [] };
    expect(isConfirmed({ home: full, away: full })).toBe(true);
    expect(isConfirmed({ home: full, away: empty })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/apiFootball.test.ts`
Expected: FAIL — funciones no exportadas.

- [ ] **Step 3: Write minimal implementation**

```ts
// añadir a convex/lib/apiFootball.ts

export type LiveFixture = {
  fixtureId: number; homeApiId: number | null; awayApiId: number | null;
  homeName: string; awayName: string;
};
export type MappedPlayer = { name: string; number?: number; pos?: string; grid?: string };
export type StoredTeamLineup = {
  name: string; formation: string; coach: string;
  startXI: MappedPlayer[]; bench: MappedPlayer[];
};
export type MappedTeamLineup = StoredTeamLineup & { apiTeamId: number | null };
export type StoredLineups = { home: StoredTeamLineup; away: StoredTeamLineup };

type RawFixture = {
  fixture?: { id?: number | null };
  teams?: { home?: { id?: number | null; name?: string }; away?: { id?: number | null; name?: string } };
};
type RawPlayer = { player?: { name?: string; number?: number | null; pos?: string | null; grid?: string | null } };
type RawLineupTeam = {
  team?: { id?: number | null; name?: string };
  formation?: string | null; coach?: { name?: string } | null;
  startXI?: RawPlayer[]; substitutes?: RawPlayer[];
};

export function mapLiveFixtures(json: { response?: RawFixture[] }): LiveFixture[] {
  return (json.response ?? [])
    .filter((f): f is RawFixture & { fixture: { id: number } } => typeof f.fixture?.id === "number")
    .map((f) => ({
      fixtureId: f.fixture.id,
      homeApiId: f.teams?.home?.id ?? null,
      awayApiId: f.teams?.away?.id ?? null,
      homeName: f.teams?.home?.name ?? "",
      awayName: f.teams?.away?.name ?? "",
    }));
}

function mapPlayer(p: RawPlayer): MappedPlayer {
  const pl = p.player ?? {};
  const out: MappedPlayer = { name: pl.name ?? "" };
  if (typeof pl.number === "number") out.number = pl.number;
  if (pl.pos) out.pos = pl.pos;
  if (pl.grid) out.grid = pl.grid;
  return out;
}

export function mapLineups(json: { response?: RawLineupTeam[] }): MappedTeamLineup[] {
  return (json.response ?? []).map((t) => ({
    apiTeamId: t.team?.id ?? null,
    name: t.team?.name ?? "",
    formation: t.formation ?? "",
    coach: t.coach?.name ?? "",
    startXI: (t.startXI ?? []).map(mapPlayer),
    bench: (t.substitutes ?? []).map(mapPlayer),
  }));
}

const strip = (t: MappedTeamLineup): StoredTeamLineup => ({
  name: t.name, formation: t.formation, coach: t.coach, startXI: t.startXI, bench: t.bench,
});

/** Asigna las dos alineaciones a home/away según los ids del fixture en vivo. */
export function orientLineups(teams: MappedTeamLineup[], fixture: LiveFixture): StoredLineups {
  const byId = (id: number | null) => teams.find((t) => t.apiTeamId != null && t.apiTeamId === id);
  const home = byId(fixture.homeApiId) ?? teams[0];
  const away = byId(fixture.awayApiId) ?? teams[1];
  const empty: StoredTeamLineup = { name: "", formation: "", coach: "", startXI: [], bench: [] };
  return { home: home ? strip(home) : empty, away: away ? strip(away) : empty };
}

/** El 11 está confirmado cuando AMBOS equipos ya publicaron titulares. */
export function isConfirmed(l: StoredLineups): boolean {
  return l.home.startXI.length > 0 && l.away.startXI.length > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/apiFootball.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/lib/apiFootball.ts convex/lib/apiFootball.test.ts
git commit -m "feat(lineups): mappers de fixtures/alineaciones + orientación + isConfirmed"
```

---

## Task 3: Reconciliación partido↔fixture

**Files:**
- Modify: `convex/lib/apiFootball.ts`
- Test: `convex/lib/apiFootball.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// añadir a convex/lib/apiFootball.test.ts
import { matchLiveFixture } from "./apiFootball";

describe("matchLiveFixture", () => {
  const fixtures = [
    { fixtureId: 10, homeApiId: 50, awayApiId: 42, homeName: "Manchester City FC", awayName: "Arsenal FC" },
    { fixtureId: 11, homeApiId: 1, awayApiId: 2, homeName: "Real Madrid", awayName: "Barcelona" },
  ];
  it("empareja por nombre normalizado de ambos equipos", () => {
    const f = matchLiveFixture({ homeName: "Man City", awayName: "Arsenal", apiFixtureId: null }, fixtures);
    expect(f?.fixtureId).toBe(10);
  });
  it("prefiere el apiFixtureId guardado (crosswalk auto-curado)", () => {
    const f = matchLiveFixture({ homeName: "x", awayName: "y", apiFixtureId: 11 }, fixtures);
    expect(f?.fixtureId).toBe(11);
  });
  it("devuelve null si no hay coincidencia", () => {
    expect(matchLiveFixture({ homeName: "Sevilla", awayName: "Betis", apiFixtureId: null }, fixtures)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/apiFootball.test.ts`
Expected: FAIL — `matchLiveFixture is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// añadir a convex/lib/apiFootball.ts

export type LiveMatchKey = { homeName: string; awayName: string; apiFixtureId: number | null };

/** Encuentra el fixture en vivo de API-Football que corresponde a un partido nuestro.
 *  Si ya hay apiFixtureId guardado, empareja por id (determinista); si no, por nombre
 *  normalizado de AMBOS equipos. Devuelve null si no hay coincidencia. */
export function matchLiveFixture(match: LiveMatchKey, fixtures: LiveFixture[]): LiveFixture | null {
  if (match.apiFixtureId != null) {
    return fixtures.find((f) => f.fixtureId === match.apiFixtureId) ?? null;
  }
  const home = normalizeTeamName(match.homeName);
  const away = normalizeTeamName(match.awayName);
  return (
    fixtures.find(
      (f) => normalizeTeamName(f.homeName) === home && normalizeTeamName(f.awayName) === away,
    ) ?? null
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/apiFootball.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/lib/apiFootball.ts convex/lib/apiFootball.test.ts
git commit -m "feat(lineups): matchLiveFixture (reconciliación por id o nombre)"
```

---

## Task 4: Helpers de fetch con manejo de 429

**Files:**
- Modify: `convex/lib/apiFootball.ts`
- Test: `convex/lib/apiFootball.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// añadir a convex/lib/apiFootball.test.ts
import { fetchLiveFixtures, fetchLineups } from "./apiFootball";
import { vi } from "vitest";

function fakeRes(opts: { status: number; retryAfter?: string | null; body?: unknown }) {
  return {
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    headers: { get: (h: string) => (h === "Retry-After" ? opts.retryAfter ?? null : null) },
    json: async () => opts.body ?? { response: [] },
  } as unknown as Response;
}

describe("fetchLiveFixtures / fetchLineups", () => {
  it("manda el header x-apisports-key y mapea la respuesta", async () => {
    const fetchFn = vi.fn(async () => fakeRes({ status: 200, body: {
      response: [{ fixture: { id: 7 }, teams: { home: { id: 1, name: "A" }, away: { id: 2, name: "B" } } }],
    } }));
    const out = await fetchLiveFixtures("KEY", { fetchFn });
    expect(out[0].fixtureId).toBe(7);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("/fixtures?live=all");
    expect((init as RequestInit).headers).toMatchObject({ "x-apisports-key": "KEY" });
  });

  it("reintenta una vez tras 429 respetando Retry-After", async () => {
    const sleep = vi.fn(async () => {});
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(fakeRes({ status: 429, retryAfter: "1" }))
      .mockResolvedValueOnce(fakeRes({ status: 200, body: { response: [] } }));
    await fetchLineups("KEY", 7, { fetchFn, sleep });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("lanza si la respuesta no es ok", async () => {
    const fetchFn = vi.fn(async () => fakeRes({ status: 500 }));
    await expect(fetchLineups("KEY", 7, { fetchFn })).rejects.toThrow("api-football 500");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lib/apiFootball.test.ts`
Expected: FAIL — `fetchLiveFixtures is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// añadir a convex/lib/apiFootball.ts

const BASE = "https://v3.football.api-sports.io";
const MAX_RETRY_WAIT_MS = 60_000;
const DEFAULT_BACKOFF_MS = 1_000;

function retryAfterMs(header: string | null | undefined): number {
  const secs = Number(header);
  if (!Number.isFinite(secs) || secs <= 0) return DEFAULT_BACKOFF_MS;
  return Math.min(Math.ceil(secs) * 1000, MAX_RETRY_WAIT_MS);
}

type FetchDeps = { fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void> };

async function fetchJson(url: string, token: string, deps: FetchDeps): Promise<unknown> {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const request = () => fetchFn(url, { headers: { "x-apisports-key": token } });
  let res = await request();
  if (res.status === 429) {
    await sleep(retryAfterMs(res.headers.get("Retry-After")));
    res = await request();
  }
  if (!res.ok) throw new Error(`api-football ${res.status}`);
  return res.json();
}

export async function fetchLiveFixtures(token: string, deps: FetchDeps = {}): Promise<LiveFixture[]> {
  return mapLiveFixtures((await fetchJson(`${BASE}/fixtures?live=all`, token, deps)) as { response?: RawFixture[] });
}

export async function fetchLineups(token: string, fixtureId: number, deps: FetchDeps = {}): Promise<MappedTeamLineup[]> {
  return mapLineups((await fetchJson(`${BASE}/fixtures/lineups?fixture=${fixtureId}`, token, deps)) as { response?: RawLineupTeam[] });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lib/apiFootball.test.ts`
Expected: PASS (todos los describes de apiFootball)

- [ ] **Step 5: Commit**

```bash
git add convex/lib/apiFootball.ts convex/lib/apiFootball.test.ts
git commit -m "feat(lineups): fetchLiveFixtures + fetchLineups con manejo de 429"
```

---

## Task 5: Tabla `lineups` y validadores

**Files:**
- Create: `convex/lib/lineupShape.ts`
- Modify: `convex/schema.ts` (añadir tabla `lineups` tras la tabla `matches`)
- Test: `convex/lineups.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/lineups.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

describe("schema lineups", () => {
  it("guarda y lee una fila de lineup", async () => {
    const t = convexTest(schema, modules);
    const id = await t.run(async (ctx) => {
      const matchId = await ctx.db.insert("matches", {
        stage: "group", kickoffAt: 0, status: "live", externalId: "m1", tournamentCode: "WC",
      });
      return ctx.db.insert("lineups", {
        matchId, tournamentCode: "WC", apiFixtureId: 7, fetchedAt: 0, confirmed: true,
        home: { name: "A", formation: "4-3-3", coach: "X", startXI: [{ name: "p", number: 1, pos: "G" }], bench: [] },
        away: { name: "B", formation: "4-4-2", coach: "Y", startXI: [], bench: [] },
      });
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.home.startXI[0].name).toBe("p");
    expect(row?.confirmed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lineups.test.ts`
Expected: FAIL — la tabla `lineups` no existe en el schema.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/lib/lineupShape.ts
// Validadores Convex de la alineación almacenada. Compartidos por schema.ts
// (definición de tabla) y lineups.ts (args de upsertLineup). El número/pos/grid
// son opcionales porque la API los omite hasta confirmar; null no es almacenable.
import { v } from "convex/values";

export const playerValidator = v.object({
  name: v.string(),
  number: v.optional(v.number()),
  pos: v.optional(v.string()),
  grid: v.optional(v.string()),
});

export const teamLineupValidator = v.object({
  name: v.string(),
  formation: v.string(),
  coach: v.string(),
  startXI: v.array(playerValidator),
  bench: v.array(playerValidator),
});
```

```ts
// convex/schema.ts — añadir el import arriba:
import { teamLineupValidator } from "./lib/lineupShape";

// ...y la tabla nueva dentro de defineSchema({ ... }), después de `matches`:
  lineups: defineTable({
    matchId: v.id("matches"),
    tournamentCode: v.string(),
    apiFixtureId: v.optional(v.number()), // fixture de API-Football reconciliado
    home: teamLineupValidator,
    away: teamLineupValidator,
    fetchedAt: v.number(),
    confirmed: v.boolean(), // ambos equipos ya publicaron el 11
  })
    .index("by_match", ["matchId"])
    .index("by_tournament", ["tournamentCode"]),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lineups.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/lib/lineupShape.ts convex/schema.ts convex/lineups.test.ts
git commit -m "feat(lineups): tabla lineups + validadores compartidos"
```

---

## Task 6: `upsertLineup` y `liveMatchesNeedingLineup`

**Files:**
- Create: `convex/lineups.ts`
- Test: `convex/lineups.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// añadir a convex/lineups.test.ts
import { internal } from "./_generated/api";

const emptyTeam = { name: "", formation: "", coach: "", startXI: [], bench: [] };
const fullTeam = (name: string) => ({ name, formation: "4-3-3", coach: "C", startXI: [{ name: "p1" }], bench: [] });

describe("upsertLineup", () => {
  it("inserta y luego parchea la MISMA fila por matchId", async () => {
    const t = convexTest(schema, modules);
    const matchId = await t.run((ctx) =>
      ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "m1", tournamentCode: "WC" }));

    await t.mutation(internal.lineups.upsertLineup, {
      matchId, tournamentCode: "WC", apiFixtureId: 7, fetchedAt: 1,
      home: emptyTeam, away: emptyTeam, confirmed: false,
    });
    await t.mutation(internal.lineups.upsertLineup, {
      matchId, tournamentCode: "WC", apiFixtureId: 7, fetchedAt: 2,
      home: fullTeam("A"), away: fullTeam("B"), confirmed: true,
    });

    const rows = await t.run((ctx) =>
      ctx.db.query("lineups").withIndex("by_match", (q) => q.eq("matchId", matchId)).collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].confirmed).toBe(true);
    expect(rows[0].home.name).toBe("A");
  });
});

describe("liveMatchesNeedingLineup", () => {
  it("solo trae partidos en vivo de los torneos en `codes`, sin lineup confirmado", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const home = await ctx.db.insert("teams", { code: "AAA", name: "Alpha", flag: "🇦", group: "A", alive: true, currentStage: "group", externalId: "t1", tournamentCode: "WC" });
      const away = await ctx.db.insert("teams", { code: "BBB", name: "Beta", flag: "🇧", group: "A", alive: true, currentStage: "group", externalId: "t2", tournamentCode: "WC" });
      // en vivo del torneo activo, sin lineup → debe salir
      await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "live1", tournamentCode: "WC", homeTeamId: home, awayTeamId: away });
      // agendado → no sale
      await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "scheduled", externalId: "sched1", tournamentCode: "WC", homeTeamId: home, awayTeamId: away });
      // en vivo de torneo NO activo (no está en codes) → no sale
      await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "pl1", tournamentCode: "PL", homeTeamId: home, awayTeamId: away });
    });

    const out = await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: ["WC"] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ tournamentCode: "WC", homeName: "Alpha", awayName: "Beta", apiFixtureId: null, confirmed: false });
  });

  it("devuelve [] si codes está vacío", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "live1", tournamentCode: "WC" }));
    expect(await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: [] })).toEqual([]);
  });

  it("excluye partidos cuyo lineup ya está confirmado", async () => {
    const t = convexTest(schema, modules);
    const matchId = await t.run(async (ctx) => {
      const m = await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "live1", tournamentCode: "WC" });
      await ctx.db.insert("lineups", { matchId: m, tournamentCode: "WC", apiFixtureId: 9, fetchedAt: 0, confirmed: true, home: fullTeam("A"), away: fullTeam("B") });
      return m;
    });
    const out = await t.query(internal.lineups.liveMatchesNeedingLineup, { codes: ["WC"] });
    expect(out.find((x) => x.matchId === matchId)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lineups.test.ts`
Expected: FAIL — `internal.lineups.upsertLineup` no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/lineups.ts
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { teamLineupValidator } from "./lib/lineupShape";
import { tournamentCodeOf } from "./lib/tournaments";
import type { Id } from "./_generated/dataModel";

/** Upsert por matchId: una sola fila de lineup por partido. */
export const upsertLineup = internalMutation({
  args: {
    matchId: v.id("matches"),
    tournamentCode: v.string(),
    apiFixtureId: v.optional(v.number()),
    home: teamLineupValidator,
    away: teamLineupValidator,
    fetchedAt: v.number(),
    confirmed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("lineups")
      .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
      .first();
    if (existing) await ctx.db.patch(existing._id, args);
    else await ctx.db.insert("lineups", args);
    return null;
  },
});

export type LiveMatchNeedingLineup = {
  matchId: Id<"matches">; tournamentCode: string;
  homeName: string; awayName: string; apiFixtureId: number | null; confirmed: boolean;
};

/** Partidos GLOBALMENTE en vivo (status real, no overrides) de los torneos `codes`
 *  (los activos los provee internal.tournaments.activeTournamentCodes desde la action),
 *  cuyo 11 aún no está confirmado en cache. Lo que el cron debe sondear.
 *  Una query no puede llamar a otra (no hay ctx.runQuery en QueryCtx); por eso los
 *  códigos llegan como argumento en vez de recalcularlos aquí. */
export const liveMatchesNeedingLineup = internalQuery({
  args: { codes: v.array(v.string()) },
  handler: async (ctx, { codes }): Promise<LiveMatchNeedingLineup[]> => {
    const active = new Set(codes);
    if (active.size === 0) return [];

    // Scan en memoria (≤ ~600 filas en free tier, igual que resolveQuiniela).
    const matches = (await ctx.db.query("matches").collect()).filter(
      (m) => m.status === "live" && active.has(tournamentCodeOf(m)),
    );

    const out: LiveMatchNeedingLineup[] = [];
    for (const m of matches) {
      const existing = await ctx.db
        .query("lineups")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .first();
      if (existing?.confirmed) continue;
      const home = m.homeTeamId ? await ctx.db.get(m.homeTeamId) : null;
      const away = m.awayTeamId ? await ctx.db.get(m.awayTeamId) : null;
      out.push({
        matchId: m._id,
        tournamentCode: tournamentCodeOf(m),
        homeName: home?.name ?? "",
        awayName: away?.name ?? "",
        apiFixtureId: existing?.apiFixtureId ?? null,
        confirmed: existing?.confirmed ?? false,
      });
    }
    return out;
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lineups.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/lineups.ts convex/lineups.test.ts
git commit -m "feat(lineups): upsertLineup + liveMatchesNeedingLineup"
```

---

## Task 7: `runLineupSync` (núcleo puro) + `syncLineups` (action)

**Files:**
- Modify: `convex/lineups.ts`
- Test: `convex/lineups.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// añadir a convex/lineups.test.ts
import { runLineupSync } from "./lineups";
import { vi } from "vitest";

const fx = (id: number, h: string, a: string) => ({ fixtureId: id, homeApiId: id * 10, awayApiId: id * 10 + 1, homeName: h, awayName: a });
const teamLineup = (apiTeamId: number, name: string, xi: number) => ({
  apiTeamId, name, formation: "4-3-3", coach: "C",
  startXI: Array.from({ length: xi }, (_, i) => ({ name: `p${i}` })), bench: [],
});

describe("runLineupSync", () => {
  it("sin partidos en vivo no hace NINGUNA llamada", async () => {
    const fetchLive = vi.fn();
    const fetchOne = vi.fn();
    const upsert = vi.fn();
    await runLineupSync([], { fetchLive, fetchOne, upsert });
    expect(fetchLive).not.toHaveBeenCalled();
    expect(fetchOne).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("una sola llamada live=all y un upsert por partido reconciliado", async () => {
    const fetchLive = vi.fn(async () => [fx(1, "Alpha", "Beta")]);
    const fetchOne = vi.fn(async () => [teamLineup(11, "Beta", 11), teamLineup(10, "Alpha", 11)]);
    const upsert = vi.fn(async () => {});
    await runLineupSync(
      [{ matchId: "m1", tournamentCode: "WC", homeName: "Alpha", awayName: "Beta", apiFixtureId: null, confirmed: false }],
      { fetchLive, fetchOne, upsert },
    );
    expect(fetchLive).toHaveBeenCalledTimes(1);
    expect(fetchOne).toHaveBeenCalledWith(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg).toMatchObject({ matchId: "m1", apiFixtureId: 1, confirmed: true });
    expect(arg.home.name).toBe("Alpha"); // orientado por id del fixture
  });

  it("salta el partido sin fixture reconciliado (no llama a fetchOne)", async () => {
    const fetchLive = vi.fn(async () => [fx(1, "Otro", "Equipo")]);
    const fetchOne = vi.fn();
    const upsert = vi.fn();
    await runLineupSync(
      [{ matchId: "m1", tournamentCode: "WC", homeName: "Alpha", awayName: "Beta", apiFixtureId: null, confirmed: false }],
      { fetchLive, fetchOne, upsert },
    );
    expect(fetchOne).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("un fallo en un partido no aborta el resto", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchLive = vi.fn(async () => [fx(1, "Alpha", "Beta"), fx(2, "Gamma", "Delta")]);
    const fetchOne = vi.fn(async (id: number) => {
      if (id === 1) throw new Error("boom");
      return [teamLineup(20, "Gamma", 11), teamLineup(21, "Delta", 11)];
    });
    const upsert = vi.fn(async () => {});
    await runLineupSync(
      [
        { matchId: "m1", tournamentCode: "WC", homeName: "Alpha", awayName: "Beta", apiFixtureId: null, confirmed: false },
        { matchId: "m2", tournamentCode: "WC", homeName: "Gamma", awayName: "Delta", apiFixtureId: null, confirmed: false },
      ],
      { fetchLive, fetchOne, upsert },
    );
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].matchId).toBe("m2");
    errorSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lineups.test.ts`
Expected: FAIL — `runLineupSync is not exported`.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/lineups.ts — añade `internalAction` a la línea EXISTENTE de "./_generated/server"
// (queda: import { internalMutation, internalQuery, internalAction } from "./_generated/server";)
// y añade estos imports nuevos:
import { internal } from "./_generated/api";
import {
  fetchLiveFixtures, fetchLineups, matchLiveFixture, orientLineups, isConfirmed,
  type LiveFixture, type MappedTeamLineup, type StoredLineups,
} from "./lib/apiFootball";

declare const process: { env: Record<string, string | undefined> };

export type LineupUpsert = {
  matchId: string; tournamentCode: string; apiFixtureId: number;
  home: StoredLineups["home"]; away: StoredLineups["away"]; fetchedAt: number; confirmed: boolean;
};
// matchId: string (no Id<>) para que el núcleo puro sea testeable con literales
// "m1"; LiveMatchNeedingLineup (matchId: Id<"matches">) es asignable porque Id ⊂ string.
type LiveMatchInput = {
  matchId: string; tournamentCode: string;
  homeName: string; awayName: string; apiFixtureId: number | null; confirmed: boolean;
};
type SyncDeps = {
  fetchLive: () => Promise<LiveFixture[]>;
  fetchOne: (fixtureId: number) => Promise<MappedTeamLineup[]>;
  upsert: (u: LineupUpsert) => Promise<void>;
  now?: number;
};

/** Núcleo puro del ciclo (deps inyectadas para testear sin red ni Convex):
 *  0 llamadas si no hay partidos en vivo; si los hay, 1 live=all + 1 lineup por
 *  partido reconciliado. Un fallo por partido se loguea y no aborta el resto. */
export async function runLineupSync(
  live: LiveMatchInput[],
  deps: SyncDeps,
): Promise<void> {
  if (live.length === 0) return;
  const fixtures = await deps.fetchLive();
  const now = deps.now ?? 0;
  for (const m of live) {
    try {
      const fixture = matchLiveFixture(m, fixtures);
      if (!fixture) continue;
      const teams = await deps.fetchOne(fixture.fixtureId);
      const oriented = orientLineups(teams, fixture);
      await deps.upsert({
        matchId: m.matchId, tournamentCode: m.tournamentCode, apiFixtureId: fixture.fixtureId,
        home: oriented.home, away: oriented.away, fetchedAt: now, confirmed: isConfirmed(oriented),
      });
    } catch (e) {
      console.error(`lineup de ${m.matchId} falló: ${String(e instanceof Error ? e.message : e)}`);
    }
  }
}

/** Entrada del cron: sondea alineaciones de partidos en vivo. */
export const syncLineups = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx): Promise<{ ok: boolean; error?: string }> => {
    const token = process.env.API_FOOTBALL_TOKEN;
    if (!token) return { ok: false, error: "missing API_FOOTBALL_TOKEN" };
    // Reusa el helper canónico de "torneos con quiniela viva" (ADR-0001).
    const codes = await ctx.runQuery(internal.tournaments.activeTournamentCodes, {});
    const live = await ctx.runQuery(internal.lineups.liveMatchesNeedingLineup, { codes });
    await runLineupSync(live, {
      fetchLive: () => fetchLiveFixtures(token),
      fetchOne: (fixtureId) => fetchLineups(token, fixtureId),
      upsert: async (u) => {
        await ctx.runMutation(internal.lineups.upsertLineup, {
          matchId: u.matchId as Id<"matches">,
          tournamentCode: u.tournamentCode, apiFixtureId: u.apiFixtureId,
          home: u.home, away: u.away, fetchedAt: u.fetchedAt, confirmed: u.confirmed,
        });
      },
      now: Date.now(),
    });
    return { ok: true };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lineups.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/lineups.ts convex/lineups.test.ts
git commit -m "feat(lineups): runLineupSync + action syncLineups"
```

---

## Task 8: Tipos de vista + query reactiva `getLiveLineups`

**Files:**
- Modify: `convex/types.ts` (añadir al final)
- Modify: `convex/lineups.ts`
- Test: `convex/lineups.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// añadir a convex/lineups.test.ts
import { api } from "./_generated/api";

describe("getLiveLineups", () => {
  it("devuelve solo partidos en vivo del torneo de la quiniela, con su lineup", async () => {
    const t = convexTest(schema, modules);
    const quinielaId = await t.run(async (ctx) => {
      const home = await ctx.db.insert("teams", { code: "AAA", name: "Alpha", flag: "🇦", group: "A", alive: true, currentStage: "group", externalId: "t1", tournamentCode: "WC" });
      const away = await ctx.db.insert("teams", { code: "BBB", name: "Beta", flag: "🇧", group: "A", alive: true, currentStage: "group", externalId: "t2", tournamentCode: "WC" });
      const liveMatch = await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "live", externalId: "live1", tournamentCode: "WC", homeTeamId: home, awayTeamId: away, homeScore: 1, awayScore: 0 });
      await ctx.db.insert("matches", { stage: "group", kickoffAt: 0, status: "scheduled", externalId: "sched1", tournamentCode: "WC", homeTeamId: home, awayTeamId: away });
      await ctx.db.insert("lineups", { matchId: liveMatch, tournamentCode: "WC", apiFixtureId: 7, fetchedAt: 0, confirmed: true,
        home: { name: "Alpha", formation: "4-3-3", coach: "Pep", startXI: [{ name: "Ederson", number: 31 }], bench: [{ name: "Ortega" }] },
        away: { name: "Beta", formation: "4-4-2", coach: "Arteta", startXI: [{ name: "Raya" }], bench: [] } });
      return ctx.db.insert("quinielas", { name: "q", prizeText: "", numParticipants: 1, slotSizes: [1], adminToken: "a", joinToken: "j", status: "open", createdAt: 0, tournamentCode: "WC" });
    });

    const data = await t.query(api.lineups.getLiveLineups, { quinielaId });
    expect(data.matches).toHaveLength(1);
    const m = data.matches[0];
    expect(m.home?.name).toBe("Alpha");
    expect(m.homeScore).toBe(1);
    expect(m.lineup?.home.startXI[0].name).toBe("Ederson");
    expect(m.lineup?.away.coach).toBe("Arteta");
  });

  it("matches vacío si no hay partidos en vivo", async () => {
    const t = convexTest(schema, modules);
    const quinielaId = await t.run((ctx) =>
      ctx.db.insert("quinielas", { name: "q", prizeText: "", numParticipants: 1, slotSizes: [1], adminToken: "a", joinToken: "j", status: "open", createdAt: 0, tournamentCode: "WC" }));
    const data = await t.query(api.lineups.getLiveLineups, { quinielaId });
    expect(data.matches).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/lineups.test.ts`
Expected: FAIL — `api.lineups.getLiveLineups` no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// añadir al FINAL de convex/types.ts
export type LineupPlayerView = { name: string; number: number | null; pos: string | null };
export type TeamLineupView = {
  formation: string; coach: string;
  startXI: LineupPlayerView[]; bench: LineupPlayerView[];
};
export type LiveMatchLineupView = {
  matchId: string;
  home: TeamLite | null; away: TeamLite | null;
  homeScore: number | null; awayScore: number | null;
  lineup: { home: TeamLineupView; away: TeamLineupView } | null;
};
export type LiveLineupsData = { matches: LiveMatchLineupView[] };
```

`TeamLite` ya está exportado en `convex/types.ts` (lo usan las demás vistas), así que el import nuevo no hace falta.

```ts
// convex/lineups.ts — añade `query` a la línea EXISTENTE de "./_generated/server"
// (queda: import { internalMutation, internalQuery, internalAction, query } from "./_generated/server";)
// y añade estos imports nuevos. `tournamentCodeOf` ya viene del import de Task 6.
import { teamLite } from "./lib/view";
import type { LiveLineupsData, LiveMatchLineupView, TeamLineupView, LineupPlayerView } from "./types";
import type { Doc } from "./_generated/dataModel";

function playerView(p: { name: string; number?: number; pos?: string }): LineupPlayerView {
  return { name: p.name, number: p.number ?? null, pos: p.pos ?? null };
}
function teamLineupView(t: Doc<"lineups">["home"]): TeamLineupView {
  return { formation: t.formation, coach: t.coach, startXI: t.startXI.map(playerView), bench: t.bench.map(playerView) };
}

/** Partidos en vivo del torneo de la quiniela + su alineación cacheada. Reactiva. */
export const getLiveLineups = query({
  args: { quinielaId: v.id("quinielas") },
  handler: async (ctx, { quinielaId }): Promise<LiveLineupsData> => {
    const qn = await ctx.db.get(quinielaId);
    if (!qn) return { matches: [] };
    const code = tournamentCodeOf(qn);
    const matches = (await ctx.db.query("matches").collect()).filter(
      (m) => m.status === "live" && tournamentCodeOf(m) === code,
    );
    const out: LiveMatchLineupView[] = [];
    for (const m of matches) {
      const home = m.homeTeamId ? await ctx.db.get(m.homeTeamId) : null;
      const away = m.awayTeamId ? await ctx.db.get(m.awayTeamId) : null;
      const row = await ctx.db
        .query("lineups")
        .withIndex("by_match", (q) => q.eq("matchId", m._id))
        .first();
      out.push({
        matchId: m._id as string,
        home: teamLite(home),
        away: teamLite(away),
        homeScore: m.homeScore ?? null,
        awayScore: m.awayScore ?? null,
        lineup: row ? { home: teamLineupView(row.home), away: teamLineupView(row.away) } : null,
      });
    }
    return { matches: out };
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/lineups.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add convex/types.ts convex/lineups.ts convex/lineups.test.ts
git commit -m "feat(lineups): query reactiva getLiveLineups + tipos de vista"
```

---

## Task 9: Registrar el cron

**Files:**
- Modify: `convex/crons.ts`

- [ ] **Step 1: Añadir el cron**

```ts
// convex/crons.ts — añadir tras la línea de "sync active tournaments":
crons.interval("sync live lineups", { minutes: 5 }, internal.lineups.syncLineups, {});
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run build`
Expected: compila sin errores (la referencia `internal.lineups.syncLineups` resuelve).

- [ ] **Step 3: Commit**

```bash
git add convex/crons.ts
git commit -m "feat(lineups): cron cada 5 min para alineaciones en vivo"
```

---

## Task 10: Componentes web `LiveLineups` + `LineupSheet`

**Files:**
- Create: `src/components/LiveLineups.tsx`
- Test: `src/components/LiveLineups.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/LiveLineups.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveLineups, LineupSheet } from "./LiveLineups";
import type { LiveMatchLineupView } from "@/../convex/types";

const team = (code: string, name: string) => ({ code, name, flag: `https://crests/${code}.png`, group: "A" });
const match = (over: Partial<LiveMatchLineupView> = {}): LiveMatchLineupView => ({
  matchId: "m1", home: team("ALP", "Alpha"), away: team("BET", "Beta"),
  homeScore: 1, awayScore: 0,
  lineup: { home: { formation: "4-3-3", coach: "Pep", startXI: [{ name: "Ederson", number: 31, pos: "G" }], bench: [{ name: "Ortega", number: 18, pos: "G" }] },
            away: { formation: "4-4-2", coach: "Arteta", startXI: [{ name: "Raya", number: 1, pos: "G" }], bench: [] } },
  ...over,
});

describe("LiveLineups", () => {
  it("no renderiza nada sin partidos en vivo", () => {
    const { container } = render(<LiveLineups matches={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("renderiza una tarjeta por partido en vivo", () => {
    render(<LiveLineups matches={[match()]} />);
    expect(screen.getByText("Alpha")).toBeDefined();
    expect(screen.getByText("Beta")).toBeDefined();
    expect(screen.getByText(/en vivo/i)).toBeDefined();
  });
});

describe("LineupSheet", () => {
  it("muestra formación, DT, 11 y banca de ambos equipos", () => {
    render(<LineupSheet match={match()} />);
    // formación y DT viven en el mismo <p> ("4-3-3 · DT Pep"); regex = subcadena.
    expect(screen.getByText(/4-3-3/)).toBeDefined();
    expect(screen.getByText(/DT Pep/)).toBeDefined();
    expect(screen.getByText("Ederson")).toBeDefined(); // nombre = nodo de texto propio
    expect(screen.getByText("Ortega")).toBeDefined();
    expect(screen.getByText("Raya")).toBeDefined();
  });
  it("muestra estado vacío si el 11 aún no está publicado", () => {
    render(<LineupSheet match={match({ lineup: null })} />);
    expect(screen.getByText(/por confirmar/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/LiveLineups.test.tsx`
Expected: FAIL — módulo `./LiveLineups` no existe.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/LiveLineups.tsx
import type { LiveMatchLineupView, TeamLineupView } from "@/../convex/types";
import { TeamFlag } from "@/components/TeamCard";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/** Sección "En vivo" de la Vista Torneo: una tarjeta por partido jugándose ahora.
 *  Presentacional: la ruta inyecta `matches` desde getLiveLineups. */
export function LiveLineups({ matches }: { matches: LiveMatchLineupView[] }) {
  if (matches.length === 0) return null;
  return (
    <section className="mb-5">
      <h2 className="mb-2 flex items-center gap-1.5 font-heading text-sm font-bold tracking-wide text-muted-foreground uppercase">
        <span className="inline-block size-2 animate-pulse rounded-full bg-eliminated" /> En vivo
      </h2>
      <div className="space-y-2">
        {matches.map((m) => (
          <Dialog key={m.matchId}>
            <DialogTrigger asChild>
              <button className="grain relative w-full overflow-hidden rounded-2xl border border-border bg-card px-3.5 py-3 text-left">
                <MatchHeader m={m} />
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {m.home?.name ?? "—"} vs {m.away?.name ?? "—"}
                </DialogTitle>
              </DialogHeader>
              <LineupSheet match={m} />
            </DialogContent>
          </Dialog>
        ))}
      </div>
    </section>
  );
}

function MatchHeader({ m }: { m: LiveMatchLineupView }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {m.home && <TeamFlag flag={m.home.flag} name={m.home.name} className="text-lg leading-none" />}
        <span className="truncate text-sm font-medium">{m.home?.name ?? "—"}</span>
      </span>
      <span className="font-heading text-sm font-bold tabular-nums">{m.homeScore ?? 0}–{m.awayScore ?? 0}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
        <span className="truncate text-sm font-medium">{m.away?.name ?? "—"}</span>
        {m.away && <TeamFlag flag={m.away.flag} name={m.away.name} className="text-lg leading-none" />}
      </span>
    </div>
  );
}

/** Contenido del sheet: dos columnas con formación, DT, 11 y banca. */
export function LineupSheet({ match }: { match: LiveMatchLineupView }) {
  if (!match.lineup) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Alineación por confirmar</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-4">
      <TeamColumn name={match.home?.name ?? "Local"} lineup={match.lineup.home} />
      <TeamColumn name={match.away?.name ?? "Visita"} lineup={match.lineup.away} />
    </div>
  );
}

function TeamColumn({ name, lineup }: { name: string; lineup: TeamLineupView }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-heading text-sm font-bold">{name}</p>
      <p className="text-[0.7rem] text-muted-foreground">
        {lineup.formation || "—"}{lineup.coach && ` · DT ${lineup.coach}`}
      </p>
      <ul className="mt-2 space-y-0.5">
        {lineup.startXI.map((p, i) => (
          <li key={`xi-${i}`} className="flex gap-1.5 text-xs">
            <span className="w-5 shrink-0 tabular-nums text-muted-foreground">{p.number ?? ""}</span>
            <span className="truncate">{p.name}</span>
          </li>
        ))}
      </ul>
      {lineup.bench.length > 0 && (
        <>
          <p className="mt-2 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">Banca</p>
          <ul className="mt-1 space-y-0.5">
            {lineup.bench.map((p, i) => (
              <li key={`b-${i}`} className="flex gap-1.5 text-xs text-muted-foreground">
                <span className="w-5 shrink-0 tabular-nums">{p.number ?? ""}</span>
                <span className="truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/LiveLineups.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/LiveLineups.tsx src/components/LiveLineups.test.tsx
git commit -m "feat(lineups): componentes LiveLineups + LineupSheet"
```

---

## Task 11: Cablear en la Vista Torneo

**Files:**
- Modify: `src/routes/Mundial.tsx`

- [ ] **Step 1: Añadir import y query**

En `src/routes/Mundial.tsx`, añade el import del componente:

```tsx
import { LiveLineups } from "@/components/LiveLineups";
```

Dentro de `Mundial()`, después de la línea `const data = useQuery(...)`, añade:

```tsx
  const live = useQuery(api.lineups.getLiveLineups, { quinielaId: id as Id<"quinielas"> });
  const liveSection = live ? <LiveLineups matches={live.matches} /> : null;
```

- [ ] **Step 2: Renderizar la sección en ambas ramas**

En la rama `data.kind === "league"`, justo después de `{header}`:

```tsx
        {header}
        {liveSection}
```

En la rama de brackets (return final), justo después de `{header}`:

```tsx
      {header}
      {liveSection}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run build && npm run lint`
Expected: compila y lintea sin errores. (Si `eslint .` reporta errores en rutas bajo `.claude/worktrees`, ignóralos: son de otra sesión — ver memoria del proyecto.)

- [ ] **Step 4: Commit**

```bash
git add src/routes/Mundial.tsx
git commit -m "feat(lineups): sección En vivo en la Vista Torneo"
```

---

## Task 12: Verificación final

- [ ] **Step 1: Suite completa**

Run: `npm test`
Expected: PASS (incluye `apiFootball.test.ts`, `lineups.test.ts`, `LiveLineups.test.tsx`).

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npm run build`
Expected: sin errores propios.

- [ ] **Step 3: Revisión CodeRabbit (gate del flujo del proyecto)**

Run: `coderabbit review --agent --type committed --base main`
Expected: sin hallazgos bloqueantes (ver memoria `coderabbit-cli-local`).

- [ ] **Step 4: Verificación E2E local (opcional pero recomendado)**

Levanta `npm run dev`, abre una quiniela con un torneo que tenga un partido en vivo
(o siembra uno con `status="live"` vía `convex` dashboard/`run`), confirma que la sección
"En vivo" aparece arriba y que el sheet muestra las dos alineaciones. Recuerda que el cron
solo trae datos reales cuando hay un partido realmente en juego.

---

## Self-Review (cobertura del spec)

- **Fuente API-Football + endpoints** → Task 4 (`fetchLiveFixtures`/`fetchLineups`, header `x-apisports-key`).
- **Secreto `API_FOOTBALL_TOKEN`** → ya seteado en dev y prod; usado en Task 7 (`syncLineups`).
- **Tabla `lineups` + validadores** → Task 5.
- **Mappers/normalización/reconciliación** → Tasks 1-3.
- **Cadencia y límite (0 llamadas sin vivos, stop al confirmar)** → Task 6 (`liveMatchesNeedingLineup` excluye confirmados) + Task 7 (`runLineupSync` early-return) + Task 9 (cron 5 min).
- **`getLiveLineups` reactiva** → Task 8.
- **Sección "En vivo" en Vista Torneo (liga + eliminatorio)** → Tasks 10-11.
- **11 + formación + DT + banca** → Task 10 (`LineupSheet`/`TeamColumn`).
- **Fuera de alcance** (eventos en vivo, probables, fotos, partidos no-vivos) → no se implementa, consistente con el spec.
- **TDD + commits atómicos** → cada task es red→green→commit.

### Dos desviaciones intencionales respecto al texto del spec

1. **`teamLineupValidator` SIN `teamId`.** El spec (sección 2) listaba `teamId: v.optional(v.id("teams"))` en el validador. Se descarta: `orientLineups` orienta las alineaciones a home/away por los ids de API-Football del fixture, y `getLiveLineups` toma los escudos de los equipos del propio `match` (`homeTeamId`/`awayTeamId`), no del lineup row. Guardar nuestro `teamId` en la fila sería data muerta. Menos campos, menos reconciliación que mantener.
2. **`liveMatchesNeedingLineup` recibe `codes`, no los recalcula.** El spec decía que `syncLineups` reusa `internal.tournaments.activeTournamentCodes`. Como una query no puede llamar a otra (`QueryCtx` no tiene `runQuery`), la **action** invoca `activeTournamentCodes` y pasa los códigos a la query. Esto evita duplicar el scan `by_status` y deja la query como un filtro puro sobre `codes` (más fácil de testear: el test pasa `{ codes: ["WC"] }` sin sembrar quinielas).
