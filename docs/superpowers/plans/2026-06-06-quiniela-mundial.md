# Quiniela Mundial 2026 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a no-accounts web app to run a World Cup 2026 "quiniela" (pool) where participants get random teams via a share link, see their teams/results/opponents, and the owner of the champion team wins.

**Architecture:** Two data layers in Convex — a *global* layer (teams, matches, alive/champion state, synced once from a football API for all pools) and a *per-quiniela* layer (ownership). All derivation (next opponent, rankings, duels, standings) happens in Convex queries that return render-ready shapes, so React components stay thin. The admin "correct score" path and the API sync write through the same `upsertMatchResult` + `recomputeTeamStates` internal functions, so the app works end-to-end before the API is wired.

**Tech Stack:** React + Vite + TypeScript, Tailwind 4, shadcn/ui, react-router-dom v6, Convex (Cloud), vitest + convex-test + @testing-library/react. Frontend deploys to Railway; backend to Convex Cloud.

**Spec:** `docs/superpowers/specs/2026-06-06-quiniela-mundial-design.md`
**Visual reference (persisted mockups):** `.superpowers/brainstorm/38810-1780724681/content/screens.html` and `bracket.html`

---

## TDD policy for this plan

Apply **strict red-green-refactor TDD** to all backend logic (pure modules in `convex/lib/`, mutations, queries, sync). For project scaffolding and presentational React components, use **build-then-verify** (write the component, add a render smoke test, verify manually) — test-first per button is low value here (YAGNI). Every task ends with a commit.

When touching anything in `convex/`, prefer the `convex:convex-expert` agent / `convex` skills for idiomatic object-syntax functions, validators, and indexes.

---

## File structure (what each file owns)

```
convex/
  schema.ts            # all tables + indexes
  lib/
    distribution.ts    # pure: slot sizing, shuffle, draw, redistribute
    distribution.test.ts
    tournament.ts      # pure: team-state derivation, group standings (display)
    tournament.test.ts
    footballData.ts    # API adapter: fetch + map to internal shapes
    tokens.ts          # secure random token + helper
  data/
    wc2026-snapshot.json  # committed API snapshot: offline seed + test fixtures
  matches.ts           # upsertMatchResult, recomputeTeamStates (internal); setMatchResultManual (admin)
  matches.test.ts
  quinielas.ts         # createQuiniela, closeAndRedistribute, getOverview, getAdmin, generateUploadUrl
  quinielas.test.ts
  participants.ts      # joinQuiniela, getPersonalPanel
  participants.test.ts
  mundial.ts           # getMundial
  mundial.test.ts
  seed.ts              # seedFromSnapshot (internal)
  sync.ts              # syncMatches (internalAction) + auto-close
  crons.ts             # cron registration

src/
  main.tsx             # Convex provider + router
  lib/convex.ts        # ConvexReactClient
  lib/usePhotoUpload.ts # Convex file-storage upload helper
  routes/
    Home.tsx           # create form
    Join.tsx           # overview + join flow
    Personal.tsx       # personal panel
    Admin.tsx          # admin panel
  components/
    PlayerRow.tsx, TeamCard.tsx, DuelRow.tsx, GroupsView.tsx, BracketView.tsx, QuinielaTabs.tsx, Avatar.tsx
  components/ui/        # shadcn-generated
```

**Convex public function signatures (locked — keep names/shapes identical across tasks):**

| Function | Kind | Args | Returns |
|---|---|---|---|
| `quinielas.createQuiniela` | mutation | `{name, prizeText, numParticipants, photoId?}` | `{quinielaId, adminToken, joinToken}` |
| `quinielas.getOverview` | query | `{joinToken}` | `OverviewData` |
| `quinielas.getAdmin` | query | `{adminToken}` | `AdminData` |
| `quinielas.closeAndRedistribute` | mutation | `{adminToken}` | `{ok: true}` |
| `quinielas.generateUploadUrl` | mutation | `{}` | `string` (upload URL) |
| `participants.joinQuiniela` | mutation | `{joinToken, name, photoId?}` | `{personalToken}` |
| `participants.getPersonalPanel` | query | `{personalToken}` | `PersonalData` |
| `mundial.getMundial` | query | `{quinielaId}` | `MundialData` |
| `matches.setMatchResultManual` | mutation | `{adminToken, matchExternalId, homeScore, awayScore, finished}` | `{ok: true}` |
| `matches.upsertMatchResult` | internalMutation | `{match: ApiMatch}` | `void` |
| `matches.recomputeTeamStates` | internalMutation | `{}` | `void` |
| `seed.seedFromSnapshot` | internalMutation | `{}` | `{teams: number, matches: number}` |
| `sync.syncMatches` | internalAction | `{}` | `{ok: boolean, error?: string}` |

**Shared TypeScript return shapes** (define in `convex/types.ts`, import in queries + components):

```ts
// convex/types.ts
export type PlayerStatus = "alive" | "out" | "champion";

export type OverviewData = {
  quiniela: { name: string; photoUrl: string | null; prizeText: string;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished" };
  players: { participantId: string; name: string; photoUrl: string | null;
             aliveCount: number; totalCount: number; status: PlayerStatus }[];
  freeSlots: number;
  upcomingDuels: { homeOwner: string; homeTeam: TeamLite; awayOwner: string;
                   awayTeam: TeamLite; kickoffAt: number }[];
};

export type PersonalData = {
  quinielaId: string;
  quinielaName: string;
  prizeText: string;
  me: { name: string; photoUrl: string | null; status: PlayerStatus;
        aliveCount: number; totalCount: number };
  playingNow: { myTeam: TeamLite; opponent: TeamLite; opponentOwner: string;
                kickoffAt: number; status: "live" | "scheduled" }[];
  teams: { team: TeamLite; alive: boolean; group: string;
           nextMatch: { opponent: TeamLite; opponentOwner: string; kickoffAt: number } | null;
           lastResult: string | null }[];
};

export type MundialData = {
  groups: { group: string;
            rows: { team: TeamLite; points: number; gd: number; gf: number;
                    ownerName: string; ownerPhotoUrl: string | null; alive: boolean }[] }[];
  bracket: { stage: string; label: string;
             matches: { home: { team: TeamLite; owner: string } | null;
                        away: { team: TeamLite; owner: string } | null;
                        homeScore: number | null; awayScore: number | null;
                        winnerTeamId: string | null; status: string }[] }[];
};

export type AdminData = {
  quiniela: { name: string; photoUrl: string | null; prizeText: string;
              numParticipants: number; filledCount: number; status: "open" | "locked" | "finished";
              joinToken: string };
  participants: { name: string; personalToken: string; teamCount: number }[];
  matches: { externalId: string; stage: string; label: string;
             homeTeam: TeamLite | null; awayTeam: TeamLite | null;
             homeScore: number | null; awayScore: number | null;
             status: string; manualOverride: boolean }[];
};

export type TeamLite = { code: string; name: string; flag: string; group: string };
```

---

## Phase 0 — Scaffolding

### Task 0.1: Project scaffold (Vite + Tailwind 4 + shadcn + Convex + vitest)

**Files:**
- Create: whole project skeleton, `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tailwind` config, `convex/` dir.

- [ ] **Step 1: Scaffold Vite React-TS into the existing repo**

Run:
```bash
npm create vite@latest . -- --template react-ts
npm install
```
If prompted that the directory is not empty, choose "Ignore files and continue" (it will keep `.git`, `.gitignore`, `docs/`).

- [ ] **Step 2: Install runtime + dev deps**

Run:
```bash
npm install convex react-router-dom
npm install -D tailwindcss @tailwindcss/vite vitest @vitest/ui jsdom \
  @testing-library/react @testing-library/jest-dom convex-test @edge-runtime/vm
```

- [ ] **Step 3: Wire Tailwind 4 via the Vite plugin**

Edit `vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```
Replace `src/index.css` with:
```css
@import "tailwindcss";
```
Ensure `src/main.tsx` imports `./index.css`.

- [ ] **Step 4: Initialize shadcn/ui (Tailwind 4)**

Run:
```bash
npx shadcn@latest init -d
npx shadcn@latest add button card input label avatar badge tabs dialog sonner skeleton
```
Accept defaults. This creates `src/components/ui/*` and `components.json`. If `init` asks about Tailwind version, choose v4.

- [ ] **Step 5: Initialize Convex**

Run:
```bash
npx convex dev --once --configure=new
```
This creates `convex/`, `convex/_generated/`, and writes `VITE_CONVEX_URL` into `.env.local`. Stop after it prints the deployment URL.

- [ ] **Step 6: Configure vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: [],
    include: ["src/**/*.test.{ts,tsx}", "convex/**/*.test.ts"],
  },
});
```
Convex-test files declare their own environment with a top-of-file pragma `// @vitest-environment edge-runtime` (added per-file later). Frontend `.test.tsx` files declare `// @vitest-environment jsdom`.

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 7: Verify everything boots**

Run:
```bash
npm run build
npx vitest run
```
Expected: build succeeds; vitest reports "No test files found" (exit 0) or runs 0 tests. Then:
```bash
npm run dev
```
Expected: Vite dev server starts on http://localhost:5173 with the default page. Stop it (Ctrl-C).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + Tailwind 4 + shadcn + Convex + vitest"
```

---

## Phase 1 — Global tournament data layer

### Task 1.1: Confirm the football API + capture a data snapshot (spike)

**Goal:** De-risk the #1 unknown — that a free API exposes WC 2026 with teams + fixtures — and capture a JSON snapshot used for offline seeding and deterministic tests.

**Files:**
- Create: `convex/data/wc2026-snapshot.json`
- Create: `docs/superpowers/notes/api-decision.md`

- [ ] **Step 1: Get a football-data.org API token**

Sign up at https://www.football-data.org/client/register (free). Save the token.

- [ ] **Step 2: Confirm the World Cup competition + 2026 season**

Run (replace `$TOKEN`):
```bash
curl -s -H "X-Auth-Token: $TOKEN" \
  "https://api.football-data.org/v4/competitions/WC" | npx json -k 2>/dev/null || \
curl -s -H "X-Auth-Token: $TOKEN" "https://api.football-data.org/v4/competitions/WC"
```
Expected: JSON with `"code":"WC"` and a `currentSeason` whose `startDate` is in 2026. If the free tier does NOT return WC 2026, STOP and switch to API-Football (`https://v3.football.api-sports.io/fixtures?league=1&season=2026`, header `x-apisports-key`) — the adapter in Task 5.1 has a note for this mapping. Record the choice in `api-decision.md`.

- [ ] **Step 3: Capture teams + matches snapshots**

Run:
```bash
mkdir -p convex/data
curl -s -H "X-Auth-Token: $TOKEN" \
  "https://api.football-data.org/v4/competitions/WC/teams" > /tmp/wc-teams.json
curl -s -H "X-Auth-Token: $TOKEN" \
  "https://api.football-data.org/v4/competitions/WC/matches" > /tmp/wc-matches.json
```
Inspect that `/tmp/wc-teams.json` has ~48 teams and `/tmp/wc-matches.json` has 104 matches.

- [ ] **Step 4: Combine into the committed snapshot**

Create `convex/data/wc2026-snapshot.json` with this exact shape (hand-assemble from the two responses; keep only the fields used):
```json
{
  "teams": [
    { "externalId": "764", "code": "BRA", "name": "Brazil", "flag": "🇧🇷", "group": "C" }
  ],
  "matches": [
    { "externalId": "m1", "stage": "group", "group": "A",
      "homeExternalId": "...", "awayExternalId": "...",
      "kickoffAt": 1781740800000, "homeScore": null, "awayScore": null,
      "status": "scheduled", "bracketSlot": null }
  ]
}
```
Mapping rules (also encoded in `footballData.ts` later):
- `stage`: football-data `stage` values map `GROUP_STAGE→group`, `LAST_32→r32`, `LAST_16→r16`, `QUARTER_FINALS→qf`, `SEMI_FINALS→sf`, `THIRD_PLACE→third`, `FINAL→final`.
- `group`: football-data `group` like `"GROUP_A"` → `"A"` (null for knockout).
- `kickoffAt`: `Date.parse(utcDate)` (ms).
- `status`: `SCHEDULED|TIMED→scheduled`, `IN_PLAY|PAUSED→live`, `FINISHED→finished`.
- `flag`: derive emoji from team `tla`/country (hand-fill; helper provided in tokens task is not used here — fill literals).
- Knockout matches with undetermined teams: `homeExternalId/awayExternalId = null`, set `bracketSlot` to e.g. `"r16-1"` using array order.

This file is the offline seed + the test fixture. It must contain all 48 teams and all 104 matches.

- [ ] **Step 5: Record the decision**

Create `docs/superpowers/notes/api-decision.md` documenting: chosen API, base URL, auth header, competition code/season, endpoints, rate limit, and the field mapping above.

- [ ] **Step 6: Commit**

```bash
git add convex/data/wc2026-snapshot.json docs/superpowers/notes/api-decision.md
git commit -m "chore: confirm WC2026 API + commit data snapshot"
```

### Task 1.2: Schema

**Files:**
- Create: `convex/schema.ts`

- [ ] **Step 1: Write the schema**

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  teams: defineTable({
    code: v.string(),
    name: v.string(),
    flag: v.string(),
    group: v.string(),
    alive: v.boolean(),
    currentStage: v.string(), // "group" | "r32" | "r16" | "qf" | "sf" | "final" | "champion" | "out"
    eliminatedAt: v.optional(v.number()),
    externalId: v.string(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_group", ["group"]),

  matches: defineTable({
    stage: v.string(),
    group: v.optional(v.string()),
    homeTeamId: v.optional(v.id("teams")),
    awayTeamId: v.optional(v.id("teams")),
    kickoffAt: v.number(),
    homeScore: v.optional(v.number()),
    awayScore: v.optional(v.number()),
    status: v.string(), // "scheduled" | "live" | "finished"
    winnerTeamId: v.optional(v.id("teams")),
    externalId: v.string(),
    manualOverride: v.boolean(),
    bracketSlot: v.optional(v.string()),
  })
    .index("by_externalId", ["externalId"])
    .index("by_stage_kickoff", ["stage", "kickoffAt"])
    .index("by_kickoff", ["kickoffAt"]),

  quinielas: defineTable({
    name: v.string(),
    photoId: v.optional(v.id("_storage")),
    prizeText: v.string(),
    numParticipants: v.number(),
    slotSizes: v.array(v.number()),
    adminToken: v.string(),
    joinToken: v.string(),
    status: v.string(), // "open" | "locked" | "finished"
    championParticipantId: v.optional(v.id("participants")),
    lockedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_adminToken", ["adminToken"])
    .index("by_joinToken", ["joinToken"])
    .index("by_status", ["status"]),

  participants: defineTable({
    quinielaId: v.id("quinielas"),
    name: v.string(),
    photoId: v.optional(v.id("_storage")),
    personalToken: v.string(),
    slotIndex: v.number(),
    joinedAt: v.number(),
  })
    .index("by_personalToken", ["personalToken"])
    .index("by_quiniela", ["quinielaId"]),

  ownerships: defineTable({
    quinielaId: v.id("quinielas"),
    teamId: v.id("teams"),
    participantId: v.id("participants"),
  })
    .index("by_quiniela_team", ["quinielaId", "teamId"])
    .index("by_quiniela_participant", ["quinielaId", "participantId"])
    .index("by_quiniela", ["quinielaId"]),
});
```

- [ ] **Step 2: Verify it compiles / pushes**

Run: `npx convex dev --once`
Expected: "Convex functions ready" with no schema errors.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts && git commit -m "feat: convex schema for teams, matches, quinielas, participants, ownerships"
```

### Task 1.3: Token + types modules

**Files:**
- Create: `convex/lib/tokens.ts`, `convex/types.ts`

- [ ] **Step 1: Write tokens helper**

```ts
// convex/lib/tokens.ts
export function newToken(): string {
  // Web Crypto is available in the Convex runtime.
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}
```

- [ ] **Step 2: Write shared types**

Create `convex/types.ts` with the exact contents from the "Shared TypeScript return shapes" block above.

- [ ] **Step 3: Commit**

```bash
git add convex/lib/tokens.ts convex/types.ts
git commit -m "feat: token + shared return-shape types"
```

### Task 1.4: Pure distribution module (TDD)

**Files:**
- Create: `convex/lib/distribution.ts`
- Test: `convex/lib/distribution.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// convex/lib/distribution.test.ts
import { describe, it, expect } from "vitest";
import { computeSlotSizes, shuffleInPlace, drawN, balancedRedistribute } from "./distribution";

// deterministic RNG (mulberry32)
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("computeSlotSizes", () => {
  it("sums to total and is as even as possible", () => {
    const s = computeSlotSizes(10, 48);
    expect(s).toHaveLength(10);
    expect(s.reduce((a, b) => a + b, 0)).toBe(48);
    expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
    expect(s.filter((x) => x === 5)).toHaveLength(8);
    expect(s.filter((x) => x === 4)).toHaveLength(2);
  });
  it("handles N that divides evenly", () => {
    expect(computeSlotSizes(12, 48).every((x) => x === 4)).toBe(true);
  });
  it("handles N = 1", () => {
    expect(computeSlotSizes(1, 48)).toEqual([48]);
  });
});

describe("drawN", () => {
  it("draws n items and returns the rest, no overlap", () => {
    const pool = [1, 2, 3, 4, 5];
    const { picked, rest } = drawN(pool, 2, rng(1));
    expect(picked).toHaveLength(2);
    expect(rest).toHaveLength(3);
    expect(new Set([...picked, ...rest]).size).toBe(5);
  });
});

describe("balancedRedistribute", () => {
  it("assigns all leftover teams to participants with fewest first", () => {
    const leftovers = ["tA", "tB", "tC"];
    const counts = [{ participantId: "p1", count: 5 }, { participantId: "p2", count: 4 }];
    const result = balancedRedistribute(leftovers, counts, rng(2));
    expect(result).toHaveLength(3);
    expect(new Set(result.map((r) => r.teamId))).toEqual(new Set(leftovers));
    // p2 (fewer) should receive at least as many as p1
    const p2 = result.filter((r) => r.participantId === "p2").length;
    const p1 = result.filter((r) => r.participantId === "p1").length;
    expect(p2).toBeGreaterThanOrEqual(p1);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run convex/lib/distribution.test.ts`
Expected: FAIL — "computeSlotSizes is not a function".

- [ ] **Step 3: Implement the module**

```ts
// convex/lib/distribution.ts
export function computeSlotSizes(n: number, total = 48): number[] {
  const base = Math.floor(total / n);
  const rem = total % n;
  const sizes = Array.from({ length: n }, (_, i) => (i < rem ? base + 1 : base));
  return sizes;
}

export function shuffleInPlace<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function drawN<T>(pool: T[], n: number, rand: () => number): { picked: T[]; rest: T[] } {
  const copy = [...pool];
  shuffleInPlace(copy, rand);
  return { picked: copy.slice(0, n), rest: copy.slice(n) };
}

export function balancedRedistribute(
  leftoverTeamIds: string[],
  participantCounts: { participantId: string; count: number }[],
  rand: () => number,
): { teamId: string; participantId: string }[] {
  const counts = participantCounts.map((p) => ({ ...p }));
  const teams = [...leftoverTeamIds];
  shuffleInPlace(teams, rand);
  const out: { teamId: string; participantId: string }[] = [];
  for (const teamId of teams) {
    counts.sort((a, b) => a.count - b.count);
    const target = counts[0];
    out.push({ teamId, participantId: target.participantId });
    target.count += 1;
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run convex/lib/distribution.test.ts`
Expected: PASS (3 suites).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/distribution.ts convex/lib/distribution.test.ts
git commit -m "feat: pure team-distribution module (TDD)"
```

### Task 1.5: Pure tournament-state module (TDD)

**Files:**
- Create: `convex/lib/tournament.ts`
- Test: `convex/lib/tournament.test.ts`

Logic (the §3.3 "API-as-authority" rules, expressed over plain data):
- A team that **lost a finished knockout match** → `out`, `eliminatedAt = match.kickoffAt`.
- The **winner of a finished `final`** → `champion`.
- Once **all `group` matches are finished** AND at least one knockout match has teams assigned: any team **not referenced** in any knockout match → `out`.
- Otherwise the team is alive; `currentStage` = the latest stage it appears in among scheduled/finished matches.

- [ ] **Step 1: Write the failing tests**

```ts
// convex/lib/tournament.test.ts
import { describe, it, expect } from "vitest";
import { computeTeamStates, computeGroupStandings, type TeamRow, type MatchRow } from "./tournament";

const team = (id: string, group = "A"): TeamRow => ({ _id: id, group });
const m = (p: Partial<MatchRow>): MatchRow => ({
  _id: "x", stage: "group", group: "A", homeTeamId: null, awayTeamId: null,
  homeScore: null, awayScore: null, status: "scheduled", winnerTeamId: null,
  kickoffAt: 0, ...p,
});

describe("computeTeamStates", () => {
  it("keeps everyone alive during an unfinished group stage", () => {
    const teams = [team("a"), team("b")];
    const matches = [m({ homeTeamId: "a", awayTeamId: "b", status: "scheduled" })];
    const states = computeTeamStates(teams, matches);
    expect(states.get("a")!.alive).toBe(true);
    expect(states.get("b")!.alive).toBe(true);
  });

  it("eliminates group teams absent from the bracket once groups are done", () => {
    const teams = [team("a"), team("b"), team("c"), team("d")];
    const matches = [
      m({ stage: "group", homeTeamId: "a", awayTeamId: "b", status: "finished", homeScore: 1, awayScore: 0, winnerTeamId: "a" }),
      m({ stage: "group", homeTeamId: "c", awayTeamId: "d", status: "finished", homeScore: 2, awayScore: 2, winnerTeamId: null }),
      // bracket populated with a & c only
      m({ stage: "r32", group: undefined, homeTeamId: "a", awayTeamId: "c", status: "scheduled" }),
    ];
    const states = computeTeamStates(teams, matches);
    expect(states.get("a")!.alive).toBe(true);
    expect(states.get("c")!.alive).toBe(true);
    expect(states.get("b")!.alive).toBe(false);
    expect(states.get("d")!.alive).toBe(false);
  });

  it("eliminates the loser of a finished knockout match", () => {
    const teams = [team("a"), team("c")];
    const matches = [
      m({ stage: "r32", group: undefined, homeTeamId: "a", awayTeamId: "c", status: "finished", homeScore: 0, awayScore: 1, winnerTeamId: "c", kickoffAt: 100 }),
    ];
    const states = computeTeamStates(teams, matches);
    expect(states.get("c")!.alive).toBe(true);
    expect(states.get("a")!.alive).toBe(false);
    expect(states.get("a")!.eliminatedAt).toBe(100);
  });

  it("crowns the winner of the final as champion", () => {
    const teams = [team("a"), team("c")];
    const matches = [
      m({ stage: "final", group: undefined, homeTeamId: "a", awayTeamId: "c", status: "finished", homeScore: 2, awayScore: 1, winnerTeamId: "a" }),
    ];
    const states = computeTeamStates(teams, matches);
    expect(states.get("a")!.currentStage).toBe("champion");
    expect(states.get("a")!.alive).toBe(true);
    expect(states.get("c")!.alive).toBe(false);
  });
});

describe("computeGroupStandings", () => {
  it("orders by points then goal difference (display only)", () => {
    const teams = [team("a"), team("b")];
    const matches = [
      m({ homeTeamId: "a", awayTeamId: "b", status: "finished", homeScore: 3, awayScore: 0, winnerTeamId: "a" }),
    ];
    const rows = computeGroupStandings("A", teams, matches);
    expect(rows[0].teamId).toBe("a");
    expect(rows[0].points).toBe(3);
    expect(rows[0].gd).toBe(3);
    expect(rows[1].teamId).toBe("b");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run convex/lib/tournament.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```ts
// convex/lib/tournament.ts
export type TeamRow = { _id: string; group: string };
export type MatchRow = {
  _id: string; stage: string; group?: string;
  homeTeamId: string | null; awayTeamId: string | null;
  homeScore: number | null; awayScore: number | null;
  status: string; winnerTeamId: string | null; kickoffAt: number;
};
export type TeamState = { alive: boolean; currentStage: string; eliminatedAt?: number };

const STAGE_ORDER = ["group", "r32", "r16", "qf", "sf", "third", "final"];
const isKnockout = (stage: string) => stage !== "group";

export function computeTeamStates(teams: TeamRow[], matches: MatchRow[]): Map<string, TeamState> {
  const states = new Map<string, TeamState>();
  for (const t of teams) states.set(t._id, { alive: true, currentStage: "group" });

  // latest stage a team appears in
  for (const mt of matches) {
    for (const id of [mt.homeTeamId, mt.awayTeamId]) {
      if (!id) continue;
      const st = states.get(id);
      if (!st) continue;
      if (STAGE_ORDER.indexOf(mt.stage) > STAGE_ORDER.indexOf(st.currentStage)) {
        st.currentStage = mt.stage;
      }
    }
  }

  const groupMatches = matches.filter((mt) => mt.stage === "group");
  const groupsDone = groupMatches.length > 0 && groupMatches.every((mt) => mt.status === "finished");
  const knockoutTeams = new Set<string>();
  for (const mt of matches) {
    if (isKnockout(mt.stage)) {
      if (mt.homeTeamId) knockoutTeams.add(mt.homeTeamId);
      if (mt.awayTeamId) knockoutTeams.add(mt.awayTeamId);
    }
  }

  // group teams absent from a populated bracket → out
  if (groupsDone && knockoutTeams.size > 0) {
    for (const t of teams) {
      if (!knockoutTeams.has(t._id)) {
        const st = states.get(t._id)!;
        st.alive = false;
        st.currentStage = "out";
      }
    }
  }

  // knockout losers → out; final winner → champion
  for (const mt of matches) {
    if (!isKnockout(mt.stage) || mt.status !== "finished" || !mt.winnerTeamId) continue;
    const loserId = mt.homeTeamId === mt.winnerTeamId ? mt.awayTeamId : mt.homeTeamId;
    if (loserId && states.has(loserId)) {
      const st = states.get(loserId)!;
      st.alive = false;
      st.currentStage = "out";
      st.eliminatedAt = mt.kickoffAt;
    }
    if (mt.stage === "final") {
      const st = states.get(mt.winnerTeamId)!;
      st.currentStage = "champion";
      st.alive = true;
    }
  }
  return states;
}

export function computeGroupStandings(group: string, teams: TeamRow[], matches: MatchRow[]) {
  const inGroup = teams.filter((t) => t.group === group);
  const stat = new Map(inGroup.map((t) => [t._id, { teamId: t._id, points: 0, gf: 0, ga: 0 }]));
  for (const mt of matches) {
    if (mt.stage !== "group" || mt.status !== "finished") continue;
    const h = mt.homeTeamId && stat.get(mt.homeTeamId);
    const a = mt.awayTeamId && stat.get(mt.awayTeamId);
    if (!h || !a || mt.homeScore == null || mt.awayScore == null) continue;
    h.gf += mt.homeScore; h.ga += mt.awayScore;
    a.gf += mt.awayScore; a.ga += mt.homeScore;
    if (mt.homeScore > mt.awayScore) h.points += 3;
    else if (mt.homeScore < mt.awayScore) a.points += 3;
    else { h.points += 1; a.points += 1; }
  }
  return [...stat.values()]
    .map((s) => ({ ...s, gd: s.gf - s.ga }))
    .sort((x, y) => y.points - x.points || y.gd - x.gd || y.gf - x.gf);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run convex/lib/tournament.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/tournament.ts convex/lib/tournament.test.ts
git commit -m "feat: pure tournament-state + group-standings module (TDD)"
```

### Task 1.6: Seed from snapshot + upsert/recompute internal mutations (TDD)

**Files:**
- Create: `convex/seed.ts`, `convex/matches.ts`
- Test: `convex/matches.test.ts`

- [ ] **Step 1: Write the failing convex-test**

```ts
// convex/matches.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

describe("seed + recompute", () => {
  it("seeds 48 teams and 104 matches with group teams populated", async () => {
    const t = convexTest(schema);
    const res = await t.mutation(internal.seed.seedFromSnapshot, {});
    expect(res.teams).toBe(48);
    expect(res.matches).toBe(104);
    const teams = await t.run((ctx) => ctx.db.query("teams").collect());
    expect(teams.every((x) => x.alive)).toBe(true);
  });

  it("upsertMatchResult records a score and recompute flips a knockout loser", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    // pick any group match, finish it
    const gm = await t.run((ctx) =>
      ctx.db.query("matches").withIndex("by_stage_kickoff", (q) => q.eq("stage", "group")).first());
    await t.mutation(internal.matches.upsertMatchResult, {
      match: { externalId: gm!.externalId, stage: "group", group: gm!.group ?? null,
        homeExternalId: null, awayExternalId: null, kickoffAt: gm!.kickoffAt,
        homeScore: 2, awayScore: 0, status: "finished", bracketSlot: null },
    });
    const updated = await t.run((ctx) =>
      ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", gm!.externalId)).first());
    expect(updated!.homeScore).toBe(2);
    expect(updated!.status).toBe("finished");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run convex/matches.test.ts`
Expected: FAIL — `internal.seed.seedFromSnapshot` undefined.

- [ ] **Step 3: Implement seed.ts**

```ts
// convex/seed.ts
import { internalMutation } from "./_generated/server";
import snapshot from "./data/wc2026-snapshot.json";

export const seedFromSnapshot = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("teams").first();
    if (existing) return { teams: 0, matches: 0 };

    const idByExternal = new Map<string, any>();
    for (const tm of snapshot.teams) {
      const id = await ctx.db.insert("teams", {
        code: tm.code, name: tm.name, flag: tm.flag, group: tm.group,
        alive: true, currentStage: "group", externalId: tm.externalId,
      });
      idByExternal.set(tm.externalId, id);
    }
    for (const mt of snapshot.matches) {
      await ctx.db.insert("matches", {
        stage: mt.stage,
        group: mt.group ?? undefined,
        homeTeamId: mt.homeExternalId ? idByExternal.get(mt.homeExternalId) : undefined,
        awayTeamId: mt.awayExternalId ? idByExternal.get(mt.awayExternalId) : undefined,
        kickoffAt: mt.kickoffAt,
        homeScore: mt.homeScore ?? undefined,
        awayScore: mt.awayScore ?? undefined,
        status: mt.status,
        externalId: mt.externalId,
        manualOverride: false,
        bracketSlot: mt.bracketSlot ?? undefined,
      });
    }
    return { teams: snapshot.teams.length, matches: snapshot.matches.length };
  },
});
```
Note: enable JSON imports — add `"resolveJsonModule": true` to `tsconfig.json` `compilerOptions` if not present.

- [ ] **Step 4: Implement matches.ts (upsert + recompute)**

```ts
// convex/matches.ts
import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { computeTeamStates, type MatchRow, type TeamRow } from "./lib/tournament";

const apiMatch = v.object({
  externalId: v.string(),
  stage: v.string(),
  group: v.union(v.string(), v.null()),
  homeExternalId: v.union(v.string(), v.null()),
  awayExternalId: v.union(v.string(), v.null()),
  kickoffAt: v.number(),
  homeScore: v.union(v.number(), v.null()),
  awayScore: v.union(v.number(), v.null()),
  status: v.string(),
  bracketSlot: v.union(v.string(), v.null()),
});

async function teamIdByExternal(ctx: any, ext: string | null) {
  if (!ext) return undefined;
  const t = await ctx.db.query("teams").withIndex("by_externalId", (q: any) => q.eq("externalId", ext)).first();
  return t?._id;
}

function winnerOf(homeId?: string, awayId?: string, hs?: number | null, as?: number | null) {
  if (hs == null || as == null) return undefined;
  if (hs > as) return homeId;
  if (as > hs) return awayId;
  return undefined; // draws resolved by API via explicit winner in knockout; group draws have no winner
}

export const upsertMatchResult = internalMutation({
  args: { match: apiMatch },
  handler: async (ctx, { match }) => {
    const existing = await ctx.db
      .query("matches").withIndex("by_externalId", (q) => q.eq("externalId", match.externalId)).first();
    if (existing?.manualOverride) return; // never clobber a manual correction

    const homeTeamId = (await teamIdByExternal(ctx, match.homeExternalId)) ?? existing?.homeTeamId;
    const awayTeamId = (await teamIdByExternal(ctx, match.awayExternalId)) ?? existing?.awayTeamId;
    const winnerTeamId =
      match.status === "finished" ? winnerOf(homeTeamId, awayTeamId, match.homeScore, match.awayScore) : undefined;

    const fields = {
      stage: match.stage,
      group: match.group ?? undefined,
      homeTeamId, awayTeamId,
      kickoffAt: match.kickoffAt,
      homeScore: match.homeScore ?? undefined,
      awayScore: match.awayScore ?? undefined,
      status: match.status,
      winnerTeamId,
      externalId: match.externalId,
      manualOverride: existing?.manualOverride ?? false,
      bracketSlot: match.bracketSlot ?? existing?.bracketSlot,
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("matches", fields);
  },
});

export const recomputeTeamStates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").collect();
    const matches = await ctx.db.query("matches").collect();
    const states = computeTeamStates(
      teams.map((t) => ({ _id: t._id, group: t.group })) as TeamRow[],
      matches.map((mt) => ({
        _id: mt._id, stage: mt.stage, group: mt.group,
        homeTeamId: mt.homeTeamId ?? null, awayTeamId: mt.awayTeamId ?? null,
        homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
        status: mt.status, winnerTeamId: mt.winnerTeamId ?? null, kickoffAt: mt.kickoffAt,
      })) as MatchRow[],
    );
    for (const t of teams) {
      const s = states.get(t._id)!;
      if (t.alive !== s.alive || t.currentStage !== s.currentStage) {
        await ctx.db.patch(t._id, { alive: s.alive, currentStage: s.currentStage, eliminatedAt: s.eliminatedAt });
      }
    }
    // finalize champion → quiniela winners
    const champion = teams.find((t) => states.get(t._id)!.currentStage === "champion");
    if (champion) {
      const quinielas = await ctx.db.query("quinielas").withIndex("by_status", (q) => q.eq("status", "locked")).collect();
      for (const qn of quinielas) {
        const own = await ctx.db.query("ownerships")
          .withIndex("by_quiniela_team", (q) => q.eq("quinielaId", qn._id).eq("teamId", champion._id)).first();
        if (own) await ctx.db.patch(qn._id, { status: "finished", championParticipantId: own.participantId });
      }
    }
  },
});

export const setMatchResultManual = mutation({
  args: { adminToken: v.string(), matchExternalId: v.string(),
          homeScore: v.number(), awayScore: v.number(), finished: v.boolean() },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const match = await ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", args.matchExternalId)).first();
    if (!match) throw new Error("Partido no encontrado");
    const winnerTeamId = !args.finished ? undefined
      : args.homeScore > args.awayScore ? match.homeTeamId
      : args.awayScore > args.homeScore ? match.awayTeamId : undefined;
    await ctx.db.patch(match._id, {
      homeScore: args.homeScore, awayScore: args.awayScore,
      status: args.finished ? "finished" : "live",
      winnerTeamId, manualOverride: true,
    });
    await ctx.runMutation((await import("./_generated/api")).internal.matches.recomputeTeamStates, {});
    return { ok: true as const };
  },
});
```

> Note for the implementer: calling an internal mutation from a mutation uses `ctx.runMutation(internal.matches.recomputeTeamStates, {})`. Import `internal` from `./_generated/api` at top-of-file instead of the dynamic import above:
> ```ts
> import { internal } from "./_generated/api";
> // ...
> await ctx.runMutation(internal.matches.recomputeTeamStates, {});
> ```

- [ ] **Step 5: Run tests, verify pass**

Run: `npx vitest run convex/matches.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/seed.ts convex/matches.ts convex/matches.test.ts tsconfig.json
git commit -m "feat: seed + upsert + recompute team states (TDD)"
```

---

## Phase 2 — Quiniela layer

### Task 2.1: createQuiniela + generateUploadUrl (TDD)

**Files:**
- Create: `convex/quinielas.ts`
- Test: `convex/quinielas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/quinielas.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

async function seeded() {
  const t = convexTest(schema);
  await t.mutation(internal.seed.seedFromSnapshot, {});
  return t;
}

describe("createQuiniela", () => {
  it("creates a quiniela with tokens and precomputed slot sizes", async () => {
    const t = await seeded();
    const res = await t.mutation(api.quinielas.createQuiniela, {
      name: "Familia", prizeText: "$5,000", numParticipants: 10,
    });
    expect(res.quinielaId).toBeDefined();
    expect(res.adminToken).toHaveLength(64);
    expect(res.joinToken).toHaveLength(64);
    const qn = await t.run((ctx) => ctx.db.get(res.quinielaId as any));
    expect(qn!.slotSizes.reduce((a: number, b: number) => a + b, 0)).toBe(48);
    expect(qn!.status).toBe("open");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run convex/quinielas.test.ts`
Expected: FAIL — `api.quinielas.createQuiniela` undefined.

- [ ] **Step 3: Implement createQuiniela + generateUploadUrl**

```ts
// convex/quinielas.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { newToken } from "./lib/tokens";
import { computeSlotSizes, shuffleInPlace } from "./lib/distribution";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const createQuiniela = mutation({
  args: {
    name: v.string(),
    prizeText: v.string(),
    numParticipants: v.number(),
    photoId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const n = Math.max(1, Math.min(48, Math.floor(args.numParticipants)));
    const slotSizes = shuffleInPlace(computeSlotSizes(n, 48), Math.random);
    const adminToken = newToken();
    const joinToken = newToken();
    const quinielaId = await ctx.db.insert("quinielas", {
      name: args.name.trim().slice(0, 60),
      prizeText: args.prizeText.trim().slice(0, 60),
      numParticipants: n,
      slotSizes,
      adminToken,
      joinToken,
      status: "open",
      photoId: args.photoId,
      createdAt: Date.now(),
    });
    return { quinielaId, adminToken, joinToken };
  },
});
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run convex/quinielas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/quinielas.ts convex/quinielas.test.ts
git commit -m "feat: createQuiniela + upload url (TDD)"
```

### Task 2.2: joinQuiniela with instant assignment (TDD)

**Files:**
- Create: `convex/participants.ts`
- Test: `convex/participants.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/participants.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

async function setup(n: number) {
  const t = convexTest(schema);
  await t.mutation(internal.seed.seedFromSnapshot, {});
  const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: n });
  return { t, q };
}

describe("joinQuiniela", () => {
  it("assigns a slot-sized batch of unique teams on join", async () => {
    const { t, q } = await setup(10);
    const res = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    expect(res.personalToken).toHaveLength(64);
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId as any)).collect());
    expect(owns.length).toBeGreaterThanOrEqual(4);
    expect(owns.length).toBeLessThanOrEqual(5);
    expect(new Set(owns.map((o) => o.teamId)).size).toBe(owns.length); // unique
  });

  it("never assigns the same team to two participants", async () => {
    const { t, q } = await setup(2); // 24 + 24
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "A" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "B" });
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId as any)).collect());
    expect(new Set(owns.map((o) => o.teamId)).size).toBe(owns.length);
  });

  it("rejects joining when all slots are full", async () => {
    const { t, q } = await setup(1);
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "A" });
    await expect(
      t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "B" }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run convex/participants.test.ts`
Expected: FAIL — function undefined.

- [ ] **Step 3: Implement joinQuiniela**

```ts
// convex/participants.ts  (getPersonalPanel added in Task 3.2)
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { newToken } from "./lib/tokens";
import { drawN } from "./lib/distribution";

export const joinQuiniela = mutation({
  args: { joinToken: v.string(), name: v.string(), photoId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    if (qn.status !== "open") throw new Error("Las inscripciones están cerradas");

    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const k = participants.length;
    if (k >= qn.numParticipants) throw new Error("Ya no hay lugares disponibles");

    const size = qn.slotSizes[k];

    // pool = teams not yet owned in this quiniela
    const owned = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownedSet = new Set(owned.map((o) => o.teamId));
    const allTeams = await ctx.db.query("teams").collect();
    const pool = allTeams.filter((tm) => !ownedSet.has(tm._id)).map((tm) => tm._id);

    const { picked } = drawN(pool, size, Math.random);

    const personalToken = newToken();
    const participantId = await ctx.db.insert("participants", {
      quinielaId: qn._id, name: args.name.trim().slice(0, 40),
      photoId: args.photoId, personalToken, slotIndex: k, joinedAt: Date.now(),
    });
    for (const teamId of picked) {
      await ctx.db.insert("ownerships", { quinielaId: qn._id, teamId, participantId });
    }
    return { personalToken };
  },
});
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run convex/participants.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Commit**

```bash
git add convex/participants.ts convex/participants.test.ts
git commit -m "feat: joinQuiniela instant random assignment (TDD)"
```

### Task 2.3: closeAndRedistribute (TDD)

**Files:**
- Modify: `convex/quinielas.ts`
- Test: `convex/quinielas.test.ts` (add cases)

- [ ] **Step 1: Add failing tests**

Append to `convex/quinielas.test.ts`:
```ts
describe("closeAndRedistribute", () => {
  it("assigns all 48 teams when some slots were never filled", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 10 });
    // only 3 of 10 join
    for (const name of ["A", "B", "C"]) {
      await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name });
    }
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId as any)).collect());
    expect(owns.length).toBe(48); // every team owned
    expect(new Set(owns.map((o) => o.teamId)).size).toBe(48);
    const qn = await t.run((ctx) => ctx.db.get(q.quinielaId as any));
    expect(qn!.status).toBe("locked");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run convex/quinielas.test.ts -t closeAndRedistribute`
Expected: FAIL — function undefined.

- [ ] **Step 3: Implement closeAndRedistribute**

Add to `convex/quinielas.ts`:
```ts
import { balancedRedistribute } from "./lib/distribution";

export const closeAndRedistribute = mutation({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    if (qn.status !== "open") return { ok: true as const };

    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    if (participants.length === 0) throw new Error("No hay participantes");

    const owned = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownedSet = new Set(owned.map((o) => o.teamId));
    const allTeams = await ctx.db.query("teams").collect();
    const leftovers = allTeams.filter((tm) => !ownedSet.has(tm._id)).map((tm) => tm._id as string);

    if (leftovers.length > 0) {
      const counts = participants.map((p) => ({
        participantId: p._id as string,
        count: owned.filter((o) => o.participantId === p._id).length,
      }));
      const assignments = balancedRedistribute(leftovers, counts, Math.random);
      for (const a of assignments) {
        await ctx.db.insert("ownerships", {
          quinielaId: qn._id, teamId: a.teamId as any, participantId: a.participantId as any,
        });
      }
    }
    await ctx.db.patch(qn._id, { status: "locked", lockedAt: Date.now() });
    return { ok: true as const };
  },
});
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run convex/quinielas.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add convex/quinielas.ts convex/quinielas.test.ts
git commit -m "feat: closeAndRedistribute ensures all 48 teams owned (TDD)"
```

---

## Phase 3 — Derived queries (render-ready)

### Task 3.1: getOverview (TDD)

**Files:**
- Modify: `convex/quinielas.ts`
- Test: `convex/quinielas.test.ts`

Helper needed by several queries: `photoUrl` resolution and a `teamLite` mapper. Put them in `convex/lib/view.ts`.

- [ ] **Step 1: Create view helpers**

```ts
// convex/lib/view.ts
import type { TeamLite } from "../types";
export function teamLite(t: { code: string; name: string; flag: string; group: string } | null | undefined): TeamLite | null {
  return t ? { code: t.code, name: t.name, flag: t.flag, group: t.group } : null;
}
export async function photoUrl(ctx: any, id?: string | null): Promise<string | null> {
  return id ? await ctx.storage.getUrl(id) : null;
}
```

- [ ] **Step 2: Add failing test**

Append to `convex/quinielas.test.ts`:
```ts
describe("getOverview", () => {
  it("ranks players by alive then alive-count and reports free slots", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    expect(ov.quiniela.name).toBe("F");
    expect(ov.players).toHaveLength(1);
    expect(ov.players[0].status).toBe("alive");
    expect(ov.freeSlots).toBe(3);
  });
});
```

- [ ] **Step 3: Run, verify fail.** `npx vitest run convex/quinielas.test.ts -t getOverview` → FAIL.

- [ ] **Step 4: Implement getOverview**

Add to `convex/quinielas.ts`:
```ts
import { query } from "./_generated/server";
import { teamLite, photoUrl } from "./lib/view";
import type { OverviewData, PlayerStatus } from "./types";

export const getOverview = query({
  args: { joinToken: v.string() },
  handler: async (ctx, args): Promise<OverviewData> => {
    const qn = await ctx.db.query("quinielas").withIndex("by_joinToken", (q) => q.eq("joinToken", args.joinToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");

    const teams = await ctx.db.query("teams").collect();
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();

    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));
    const players = participants.map((p) => {
      const mine = ownerships.filter((o) => o.participantId === p._id);
      const aliveCount = mine.filter((o) => teamById.get(o.teamId)?.alive).length;
      const isChampion = qn.championParticipantId === p._id;
      const status: PlayerStatus = isChampion ? "champion" : aliveCount > 0 ? "alive" : "out";
      return { participantId: p._id as string, name: p.name,
        photoUrlId: p.photoId, aliveCount, totalCount: mine.length, status };
    });
    players.sort((a, b) =>
      (b.status === "out" ? 0 : 1) - (a.status === "out" ? 0 : 1) || b.aliveCount - a.aliveCount);

    // upcoming duels: next scheduled matches where both teams owned in this quiniela
    const now = Date.now();
    const upcoming = (await ctx.db.query("matches").withIndex("by_kickoff").collect())
      .filter((mt) => mt.status !== "finished" && mt.homeTeamId && mt.awayTeamId
        && ownerByTeam.has(mt.homeTeamId) && ownerByTeam.has(mt.awayTeamId))
      .sort((a, b) => a.kickoffAt - b.kickoffAt)
      .slice(0, 8);
    const nameById = new Map(participants.map((p) => [p._id, p.name]));

    return {
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prizeText: qn.prizeText,
        numParticipants: qn.numParticipants, filledCount: participants.length, status: qn.status as any,
      },
      players: await Promise.all(players.map(async (p) => ({
        participantId: p.participantId, name: p.name, photoUrl: await photoUrl(ctx, p.photoUrlId),
        aliveCount: p.aliveCount, totalCount: p.totalCount, status: p.status,
      }))),
      freeSlots: Math.max(0, qn.numParticipants - participants.length),
      upcomingDuels: upcoming.map((mt) => ({
        homeOwner: nameById.get(ownerByTeam.get(mt.homeTeamId!)!) ?? "",
        homeTeam: teamLite(teamById.get(mt.homeTeamId!))!,
        awayOwner: nameById.get(ownerByTeam.get(mt.awayTeamId!)!) ?? "",
        awayTeam: teamLite(teamById.get(mt.awayTeamId!))!,
        kickoffAt: mt.kickoffAt,
      })),
    };
  },
});
```

- [ ] **Step 5: Run, verify pass.** `npx vitest run convex/quinielas.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/quinielas.ts convex/lib/view.ts convex/quinielas.test.ts
git commit -m "feat: getOverview ranked players + duels (TDD)"
```

### Task 3.2: getPersonalPanel (TDD)

**Files:**
- Modify: `convex/participants.ts`
- Test: `convex/participants.test.ts`

- [ ] **Step 1: Add failing test**

```ts
describe("getPersonalPanel", () => {
  it("returns my teams with next opponent and owner", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Beto" });
    const panel = await t.query(api.participants.getPersonalPanel, { personalToken: a.personalToken });
    expect(panel.me.name).toBe("Ana");
    expect(panel.teams.length).toBeGreaterThan(0);
    expect(panel.me.status).toBe("alive");
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run convex/participants.test.ts -t getPersonalPanel` → FAIL.

- [ ] **Step 3: Implement getPersonalPanel**

Add to `convex/participants.ts`:
```ts
import { query } from "./_generated/server";
import { teamLite, photoUrl } from "./lib/view";
import type { PersonalData, PlayerStatus } from "./types";

export const getPersonalPanel = query({
  args: { personalToken: v.string() },
  handler: async (ctx, args): Promise<PersonalData> => {
    const me = await ctx.db.query("participants").withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken)).first();
    if (!me) throw new Error("Jugador no encontrado");
    const qn = await ctx.db.get(me.quinielaId);
    if (!qn) throw new Error("Quiniela no encontrada");

    const teams = await ctx.db.query("teams").collect();
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const nameById = new Map(participants.map((p) => [p._id, p.name]));

    const myTeamIds = ownerships.filter((o) => o.participantId === me._id).map((o) => o.teamId);
    const allMatches = await ctx.db.query("matches").withIndex("by_kickoff").collect();

    function nextMatchFor(teamId: string) {
      return allMatches
        .filter((mt) => mt.status !== "finished" && (mt.homeTeamId === teamId || mt.awayTeamId === teamId))
        .sort((a, b) => a.kickoffAt - b.kickoffAt)[0];
    }
    function lastResultFor(teamId: string) {
      const m = allMatches
        .filter((mt) => mt.status === "finished" && (mt.homeTeamId === teamId || mt.awayTeamId === teamId))
        .sort((a, b) => b.kickoffAt - a.kickoffAt)[0];
      if (!m) return null;
      const h = teamById.get(m.homeTeamId!); const aw = teamById.get(m.awayTeamId!);
      return `${h?.flag ?? ""} ${m.homeScore}–${m.awayScore} ${aw?.flag ?? ""}`;
    }

    const teamsOut = myTeamIds.map((teamId) => {
      const t = teamById.get(teamId)!;
      const nm = nextMatchFor(teamId);
      let nextMatch = null as PersonalData["teams"][number]["nextMatch"];
      if (nm) {
        const oppId = nm.homeTeamId === teamId ? nm.awayTeamId : nm.homeTeamId;
        if (oppId) {
          nextMatch = {
            opponent: teamLite(teamById.get(oppId))!,
            opponentOwner: ownerByTeam.has(oppId) ? nameById.get(ownerByTeam.get(oppId)!) ?? "—" : "Sin dueño",
            kickoffAt: nm.kickoffAt,
          };
        }
      }
      return { team: teamLite(t)!, alive: t.alive, group: t.group, nextMatch, lastResult: lastResultFor(teamId) };
    });

    const aliveCount = teamsOut.filter((x) => x.alive).length;
    const status: PlayerStatus = qn.championParticipantId === me._id ? "champion" : aliveCount > 0 ? "alive" : "out";

    // playingNow: my teams whose next match is live or starts within 3h
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
  },
});
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run convex/participants.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/participants.ts convex/participants.test.ts
git commit -m "feat: getPersonalPanel with next opponent + owner (TDD)"
```

### Task 3.3: getMundial (TDD)

**Files:**
- Create: `convex/mundial.ts`
- Test: `convex/mundial.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// convex/mundial.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

describe("getMundial", () => {
  it("returns 12 groups with owner-tagged rows and a bracket", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Beto" });
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    const data = await t.query(api.mundial.getMundial, { quinielaId: q.quinielaId });
    expect(data.groups).toHaveLength(12);
    expect(data.groups[0].rows).toHaveLength(4);
    expect(data.groups[0].rows[0].ownerName).not.toBe("");
    expect(data.bracket.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run convex/mundial.test.ts` → FAIL.

- [ ] **Step 3: Implement getMundial**

```ts
// convex/mundial.ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { teamLite, photoUrl } from "./lib/view";
import { computeGroupStandings } from "./lib/tournament";
import type { MundialData } from "./types";

const BRACKET_STAGES: { stage: string; label: string }[] = [
  { stage: "r32", label: "Dieciseisavos" },
  { stage: "r16", label: "Octavos" },
  { stage: "qf", label: "Cuartos" },
  { stage: "sf", label: "Semifinales" },
  { stage: "third", label: "Tercer lugar" },
  { stage: "final", label: "Final" },
];

export const getMundial = query({
  args: { quinielaId: v.id("quinielas") },
  handler: async (ctx, { quinielaId }): Promise<MundialData> => {
    const teams = await ctx.db.query("teams").collect();
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const matches = await ctx.db.query("matches").collect();
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId)).collect();
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId)).collect();
    const nameById = new Map(participants.map((p) => [p._id, p]));
    const ownerByTeam = new Map(ownerships.map((o) => [o.teamId, o.participantId]));

    const ownerName = (teamId?: string | null) =>
      teamId && ownerByTeam.has(teamId) ? nameById.get(ownerByTeam.get(teamId)!)?.name ?? "—" : "Sin dueño";

    const teamRows = teams.map((t) => ({ _id: t._id as string, group: t.group }));
    const matchRows = matches.map((mt) => ({
      _id: mt._id as string, stage: mt.stage, group: mt.group,
      homeTeamId: mt.homeTeamId ?? null, awayTeamId: mt.awayTeamId ?? null,
      homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
      status: mt.status, winnerTeamId: mt.winnerTeamId ?? null, kickoffAt: mt.kickoffAt,
    }));

    const groupLetters = [...new Set(teams.map((t) => t.group))].sort();
    const groups = await Promise.all(groupLetters.map(async (g) => {
      const standings = computeGroupStandings(g, teamRows as any, matchRows as any);
      const rows = await Promise.all(standings.map(async (s) => {
        const t = teamById.get(s.teamId as any)!;
        const ownerId = ownerByTeam.get(s.teamId as any);
        return {
          team: teamLite(t)!, points: s.points, gd: s.gd, gf: s.gf,
          ownerName: ownerName(s.teamId), alive: t.alive,
          ownerPhotoUrl: ownerId ? await photoUrl(ctx, nameById.get(ownerId)?.photoId) : null,
        };
      }));
      return { group: g, rows };
    }));

    const bracket = BRACKET_STAGES.map(({ stage, label }) => ({
      stage, label,
      matches: matches.filter((mt) => mt.stage === stage).sort((a, b) => a.kickoffAt - b.kickoffAt).map((mt) => ({
        home: mt.homeTeamId ? { team: teamLite(teamById.get(mt.homeTeamId))!, owner: ownerName(mt.homeTeamId) } : null,
        away: mt.awayTeamId ? { team: teamLite(teamById.get(mt.awayTeamId))!, owner: ownerName(mt.awayTeamId) } : null,
        homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
        winnerTeamId: (mt.winnerTeamId as string) ?? null, status: mt.status,
      })),
    })).filter((s) => s.matches.length > 0);

    return { groups, bracket };
  },
});
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run convex/mundial.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/mundial.ts convex/mundial.test.ts
git commit -m "feat: getMundial groups + bracket with owners (TDD)"
```

### Task 3.4: getAdmin (TDD)

**Files:**
- Modify: `convex/quinielas.ts`
- Test: `convex/quinielas.test.ts`

- [ ] **Step 1: Add failing test**

```ts
describe("getAdmin", () => {
  it("returns participants with team counts and the match list", async () => {
    const t = convexTest(schema);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const admin = await t.query(api.quinielas.getAdmin, { adminToken: q.adminToken });
    expect(admin.participants).toHaveLength(1);
    expect(admin.participants[0].teamCount).toBeGreaterThan(0);
    expect(admin.matches.length).toBe(104);
    expect(admin.quiniela.joinToken).toBe(q.joinToken);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `-t getAdmin` → FAIL.

- [ ] **Step 3: Implement getAdmin**

Add to `convex/quinielas.ts`:
```ts
import type { AdminData } from "./types";

export const getAdmin = query({
  args: { adminToken: v.string() },
  handler: async (ctx, args): Promise<AdminData> => {
    const qn = await ctx.db.query("quinielas").withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const teams = await ctx.db.query("teams").collect();
    const teamById = new Map(teams.map((t) => [t._id, t]));
    const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const ownerships = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
    const matches = (await ctx.db.query("matches").withIndex("by_kickoff").collect());

    const STAGE_LABEL: Record<string, string> = {
      group: "Grupos", r32: "Dieciseisavos", r16: "Octavos", qf: "Cuartos",
      sf: "Semis", third: "3er lugar", final: "Final",
    };
    return {
      quiniela: {
        name: qn.name, photoUrl: await photoUrl(ctx, qn.photoId), prizeText: qn.prizeText,
        numParticipants: qn.numParticipants, filledCount: participants.length, status: qn.status as any,
        joinToken: qn.joinToken,
      },
      participants: participants.map((p) => ({
        name: p.name, personalToken: p.personalToken,
        teamCount: ownerships.filter((o) => o.participantId === p._id).length,
      })),
      matches: matches.map((mt) => ({
        externalId: mt.externalId, stage: mt.stage, label: STAGE_LABEL[mt.stage] ?? mt.stage,
        homeTeam: mt.homeTeamId ? teamLite(teamById.get(mt.homeTeamId)) : null,
        awayTeam: mt.awayTeamId ? teamLite(teamById.get(mt.awayTeamId)) : null,
        homeScore: mt.homeScore ?? null, awayScore: mt.awayScore ?? null,
        status: mt.status, manualOverride: mt.manualOverride,
      })),
    };
  },
});
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run convex/quinielas.test.ts` → PASS (all).

- [ ] **Step 5: Commit**

```bash
git add convex/quinielas.ts convex/quinielas.test.ts
git commit -m "feat: getAdmin query (TDD)"
```

---

## Phase 4 — Frontend (build-then-verify)

> All components consume the locked query shapes from `convex/types.ts`. Visual reference: the committed mockups. Use shadcn `Card`, `Avatar`, `Badge`, `Tabs`, `Button`, `Input`, `Dialog`, `sonner` toasts.

### Task 4.1: Convex provider, router, and shared bits

**Files:**
- Create: `src/lib/convex.ts`, `src/components/Avatar.tsx`, `src/lib/format.ts`
- Modify: `src/main.tsx`, `src/App.tsx` (replace default)

- [ ] **Step 1: Convex client + provider + routes**

`src/lib/convex.ts`:
```ts
import { ConvexReactClient } from "convex/react";
export const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
```

`src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider } from "convex/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { convex } from "@/lib/convex";
import Home from "@/routes/Home";
import Join from "@/routes/Join";
import Personal from "@/routes/Personal";
import Admin from "@/routes/Admin";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/q/:id/join/:token" element={<Join />} />
          <Route path="/q/:id/me/:token" element={<Personal />} />
          <Route path="/q/:id/admin/:token" element={<Admin />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </ConvexProvider>
  </React.StrictMode>,
);
```

`src/lib/format.ts`:
```ts
export function whenLabel(ms: number): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}
```

`src/components/Avatar.tsx`:
```tsx
import { Avatar as A, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  return (
    <A style={{ width: size, height: size }}>
      {url ? <AvatarImage src={url} /> : null}
      <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
    </A>
  );
}
```

Delete `src/App.tsx`/`src/App.css` references from the scaffold if `main.tsx` no longer imports them.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: builds (route components will be created next; create empty stubs that `export default function X(){return null}` if needed to compile, then fill them in their tasks).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: convex provider, router, shared Avatar/format"
```

### Task 4.2: Photo upload hook

**Files:**
- Create: `src/lib/usePhotoUpload.ts`

- [ ] **Step 1: Implement the hook**

```ts
// src/lib/usePhotoUpload.ts
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useState } from "react";

export function usePhotoUpload() {
  const generate = useMutation(api.quinielas.generateUploadUrl);
  const [uploading, setUploading] = useState(false);
  async function upload(file: File): Promise<string> {
    setUploading(true);
    try {
      const url = await generate();
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const { storageId } = await res.json();
      return storageId as string;
    } finally {
      setUploading(false);
    }
  }
  return { upload, uploading };
}
```

- [ ] **Step 2: Verify build.** `npm run build` → succeeds.

- [ ] **Step 3: Commit.** `git add -A && git commit -m "feat: photo upload hook"`

### Task 4.3: Home / Create

**Files:**
- Create: `src/routes/Home.tsx`

- [ ] **Step 1: Implement Home**

```tsx
// src/routes/Home.tsx
import { useState } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router-dom";
import { api } from "@/../convex/_generated/api";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function Home() {
  const create = useMutation(api.quinielas.createQuiniela);
  const { upload, uploading } = usePhotoUpload();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [prize, setPrize] = useState("");
  const [n, setN] = useState(10);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || n < 2) return;
    setBusy(true);
    try {
      const photoId = file ? await upload(file) : undefined;
      const res = await create({ name, prizeText: prize, numParticipants: n, photoId: photoId as any });
      nav(`/q/${res.quinielaId}/admin/${res.adminToken}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md p-4 space-y-4">
      <h1 className="text-2xl font-bold">Crear quiniela · Mundial 2026</h1>
      <Card className="p-4 space-y-3">
        <div><Label>Nombre</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Quiniela Familia 2026" /></div>
        <div><Label>Premio</Label><Input value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="$5,000" /></div>
        <div><Label>Número de participantes</Label>
          <Input type="number" min={2} max={48} value={n} onChange={(e) => setN(Number(e.target.value))} /></div>
        <div><Label>Foto (opcional)</Label>
          <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <Button className="w-full" disabled={busy || uploading || !name.trim() || n < 2} onClick={submit}>
          {busy ? "Creando…" : "Crear quiniela"}
        </Button>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Manual verify**

Run `npx convex dev` (one terminal) and `npm run dev` (another). Open http://localhost:5173, create a quiniela, confirm it redirects to `/q/:id/admin/:token`.

- [ ] **Step 3: Commit.** `git add -A && git commit -m "feat: home/create screen"`

### Task 4.4: Tabs nav + Join/Overview

**Files:**
- Create: `src/components/QuinielaTabs.tsx`, `src/components/PlayerRow.tsx`, `src/components/DuelRow.tsx`, `src/routes/Join.tsx`

- [ ] **Step 1: Tabs nav** — `src/components/QuinielaTabs.tsx`:
```tsx
import { Link, useLocation } from "react-router-dom";
export function QuinielaTabs({ id, token, kind }: { id: string; token: string; kind: "me" | "join" }) {
  const loc = useLocation();
  const base = `/q/${id}`;
  const tabs = [
    { to: kind === "me" ? `${base}/me/${token}` : "", label: "Mi panel", show: kind === "me" },
    { to: `${base}/join/${kind === "join" ? token : ""}`, label: "General", show: kind === "join" },
  ].filter((t) => t.show);
  return (
    <nav className="flex justify-around border-t bg-background sticky bottom-0 py-2 text-sm">
      {tabs.map((t) => (
        <Link key={t.label} to={t.to} className={loc.pathname === t.to ? "font-bold text-primary" : "text-muted-foreground"}>{t.label}</Link>
      ))}
    </nav>
  );
}
```
> Note: full 3-tab navigation (Mi panel / General / Mundial) needs the viewer's tokens. Keep it simple: the Personal screen links to the public Overview and Mundial via the quiniela id; Overview links to Mundial. Wire links as you build each screen; this component renders the currently-reachable tabs.

- [ ] **Step 2: PlayerRow** — `src/components/PlayerRow.tsx`:
```tsx
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/ui/badge";
import type { OverviewData } from "@/../convex/types";

export function PlayerRow({ p }: { p: OverviewData["players"][number] }) {
  const out = p.status === "out";
  return (
    <div className={`flex items-center justify-between rounded-xl border p-3 ${out ? "opacity-40 line-through" : ""}`}>
      <div className="flex items-center gap-2"><Avatar name={p.name} url={p.photoUrl} /><b>{p.name}</b></div>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-bold">{p.aliveCount}</span><span className="text-muted-foreground">/{p.totalCount} vivos</span>
        <Badge variant={out ? "destructive" : "default"}>{p.status === "champion" ? "🏆" : out ? "Fuera" : "Vivo"}</Badge>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: DuelRow** — `src/components/DuelRow.tsx`:
```tsx
import { whenLabel } from "@/lib/format";
import type { OverviewData } from "@/../convex/types";
export function DuelRow({ d }: { d: OverviewData["upcomingDuels"][number] }) {
  return (
    <div className="rounded-lg border border-dashed p-2 text-sm">
      {d.homeOwner} {d.homeTeam.flag} <span className="text-muted-foreground">vs</span> {d.awayTeam.flag} {d.awayOwner}
      <span className="text-muted-foreground"> · {whenLabel(d.kickoffAt)}</span>
    </div>
  );
}
```

- [ ] **Step 4: Join/Overview** — `src/routes/Join.tsx`:
```tsx
import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { usePhotoUpload } from "@/lib/usePhotoUpload";
import { PlayerRow } from "@/components/PlayerRow";
import { DuelRow } from "@/components/DuelRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";

export default function Join() {
  const { id, token } = useParams();
  const data = useQuery(api.quinielas.getOverview, { joinToken: token! });
  const join = useMutation(api.participants.joinQuiniela);
  const { upload } = usePhotoUpload();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (data === undefined) return <div className="p-6 text-center">Cargando…</div>;
  const canJoin = data.quiniela.status === "open" && data.freeSlots > 0;

  async function doJoin() {
    setBusy(true);
    try {
      const photoId = file ? await upload(file) : undefined;
      const res = await join({ joinToken: token!, name, photoId: photoId as any });
      localStorage.setItem(`quiniela:${id}:me`, res.personalToken);
      nav(`/q/${id}/me/${res.personalToken}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-md p-4 space-y-3 pb-16">
      <div className="flex items-center gap-3">
        {data.quiniela.photoUrl ? <img src={data.quiniela.photoUrl} className="w-12 h-12 rounded-xl object-cover" /> : <div className="w-12 h-12 rounded-xl bg-muted grid place-items-center">🏟️</div>}
        <div><h1 className="text-xl font-bold">{data.quiniela.name}</h1>
          <p className="text-sm text-muted-foreground">{data.quiniela.filledCount} de {data.quiniela.numParticipants} lugares</p></div>
      </div>
      <Card className="p-3 text-amber-600 font-bold">🏆 {data.quiniela.prizeText} al campeón</Card>

      <h2 className="text-xs uppercase tracking-wide text-muted-foreground mt-2">Tabla de jugadores</h2>
      <div className="space-y-2">{data.players.map((p) => <PlayerRow key={p.participantId} p={p} />)}</div>
      {data.freeSlots > 0 && <div className="rounded-xl border border-dashed p-3 text-center text-muted-foreground">+ {data.freeSlots} lugares libres</div>}

      {data.upcomingDuels.length > 0 && <>
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mt-2">Próximos duelos entre ustedes</h2>
        <div className="space-y-2">{data.upcomingDuels.map((d, i) => <DuelRow key={i} d={d} />)}</div>
      </>}

      <Link to={`/q/${id}/mundial`} className="block text-center text-sm text-primary underline">Ver grupos y bracket →</Link>

      {canJoin && (
        <Dialog>
          <DialogTrigger asChild><Button className="w-full">Unirme a la quiniela</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Únete</DialogTitle></DialogHeader>
            <Input placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
            <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button disabled={busy || !name.trim()} onClick={doJoin}>{busy ? "Asignando equipos…" : "Entrar y recibir mis equipos"}</Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
```
> Add a `/q/:id/mundial` route in `main.tsx` pointing to a `Mundial` screen (Task 4.6) that reads `getMundial` by id (public).

- [ ] **Step 5: Manual verify.** With dev servers running, open the join link from the admin screen, join as "Ana", confirm redirect to the personal panel and that `localStorage` holds the token.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat: overview + join flow"`

### Task 4.5: Personal panel

**Files:**
- Create: `src/components/TeamCard.tsx`, `src/routes/Personal.tsx`

- [ ] **Step 1: TeamCard** — `src/components/TeamCard.tsx`:
```tsx
import { Badge } from "@/components/ui/badge";
import { whenLabel } from "@/lib/format";
import type { PersonalData } from "@/../convex/types";

export function TeamCard({ t }: { t: PersonalData["teams"][number] }) {
  return (
    <div className={`rounded-xl border p-3 ${t.alive ? "" : "opacity-40 line-through"}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2"><span className="text-xl">{t.team.flag}</span><b>{t.team.name}</b>
          <span className="text-xs text-muted-foreground">Grupo {t.group}</span></span>
        <Badge variant={t.alive ? "default" : "destructive"}>{t.alive ? "Vivo" : "Fuera"}</Badge>
      </div>
      {t.nextMatch && (
        <p className="text-sm text-muted-foreground mt-1">
          Próximo: vs {t.nextMatch.opponent.flag} {t.nextMatch.opponent.name} · {whenLabel(t.nextMatch.kickoffAt)} · de <b>{t.nextMatch.opponentOwner}</b>
        </p>
      )}
      {t.lastResult && <p className="text-sm text-muted-foreground">Último: {t.lastResult}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Personal** — `src/routes/Personal.tsx`:
```tsx
import { useParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TeamCard } from "@/components/TeamCard";
import { whenLabel } from "@/lib/format";

export default function Personal() {
  const { id, token } = useParams();
  const data = useQuery(api.participants.getPersonalPanel, { personalToken: token! });
  if (data === undefined) return <div className="p-6 text-center">Cargando…</div>;
  const statusLabel = data.me.status === "champion" ? "🏆 Campeón" : data.me.status === "out" ? "Fuera" : `Vivo · ${data.me.aliveCount} equipos`;

  return (
    <div className="mx-auto max-w-md p-4 space-y-3 pb-16">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Avatar name={data.me.name} url={data.me.photoUrl} size={40} />
          <div><div className="font-bold">{data.me.name}</div><div className="text-xs text-muted-foreground">{data.quinielaName}</div></div></div>
        <Badge variant={data.me.status === "out" ? "destructive" : "default"}>{statusLabel}</Badge>
      </div>
      <Card className="p-3 text-amber-600 font-bold">🏆 Premio: {data.prizeText} — al dueño del campeón</Card>

      {data.playingNow.length > 0 && <>
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Jugando ahora / pronto</h2>
        {data.playingNow.map((g, i) => (
          <div key={i} className="rounded-lg border border-dashed p-2 text-sm">
            {g.myTeam.flag} <b>Tu {g.myTeam.name}</b> vs {g.opponent.flag} {g.opponent.name} — de <b>{g.opponentOwner}</b>
            <span className="text-muted-foreground"> · {whenLabel(g.kickoffAt)}</span>
          </div>
        ))}
      </>}

      <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Mis equipos</h2>
      <div className="space-y-2">{data.teams.map((t, i) => <TeamCard key={i} t={t} />)}</div>

      <Link to={`/q/${id}/mundial`} className="block text-center text-sm text-primary underline">Ver grupos y bracket →</Link>
    </div>
  );
}
```

- [ ] **Step 3: Manual verify.** Open the personal link; confirm teams render with next opponent + owner.

- [ ] **Step 4: Commit.** `git add -A && git commit -m "feat: personal panel"`

### Task 4.6: Mundial (groups + bracket)

**Files:**
- Create: `src/components/GroupsView.tsx`, `src/components/BracketView.tsx`, `src/routes/Mundial.tsx`
- Modify: `src/main.tsx` (add `/q/:id/mundial` route)

- [ ] **Step 1: GroupsView** — `src/components/GroupsView.tsx`:
```tsx
import type { MundialData } from "@/../convex/types";
export function GroupsView({ groups }: { groups: MundialData["groups"] }) {
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.group} className="rounded-xl border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Grupo {g.group}</div>
          {g.rows.map((r, i) => (
            <div key={i} className={`flex items-center justify-between py-1 ${r.alive ? "" : "opacity-40 line-through"}`}>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: r.alive ? "#4ade80" : "#f87171" }} />
                <span className="text-lg">{r.team.flag}</span> {r.team.name}
                <span className="text-xs text-muted-foreground">· {r.ownerName}</span>
              </span>
              <b>{r.points}</b>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: BracketView** — `src/components/BracketView.tsx`:
```tsx
import type { MundialData } from "@/../convex/types";
export function BracketView({ bracket }: { bracket: MundialData["bracket"] }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {bracket.map((round) => (
        <div key={round.stage} className="min-w-[150px] space-y-3">
          <div className="text-xs uppercase text-center text-muted-foreground">{round.label}</div>
          {round.matches.map((m, i) => (
            <div key={i} className="rounded-lg border text-xs overflow-hidden">
              {[m.home, m.away].map((side, j) => (
                <div key={j} className="flex items-center justify-between px-2 py-1 border-b last:border-0">
                  {side ? <span>{side.team.flag} {side.team.code} <span className="text-muted-foreground">· {side.owner}</span></span>
                        : <span className="italic text-muted-foreground">Por definir</span>}
                  <span>{j === 0 ? m.homeScore ?? "" : m.awayScore ?? ""}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Mundial route** — `src/routes/Mundial.tsx`:
```tsx
import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GroupsView } from "@/components/GroupsView";
import { BracketView } from "@/components/BracketView";

export default function Mundial() {
  const { id } = useParams();
  const data = useQuery(api.mundial.getMundial, { quinielaId: id as any });
  if (data === undefined) return <div className="p-6 text-center">Cargando…</div>;
  return (
    <div className="mx-auto max-w-md p-4 pb-16">
      <h1 className="text-xl font-bold mb-2">Mundial 2026</h1>
      <Tabs defaultValue="grupos">
        <TabsList className="w-full"><TabsTrigger value="grupos" className="flex-1">Grupos</TabsTrigger>
          <TabsTrigger value="bracket" className="flex-1">Bracket</TabsTrigger></TabsList>
        <TabsContent value="grupos"><GroupsView groups={data.groups} /></TabsContent>
        <TabsContent value="bracket"><BracketView bracket={data.bracket} /></TabsContent>
      </Tabs>
    </div>
  );
}
```
Add to `main.tsx` routes: `<Route path="/q/:id/mundial" element={<Mundial />} />` and import it.

- [ ] **Step 4: Manual verify.** Open `/q/:id/mundial`; toggle Grupos/Bracket; confirm owners show.

- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat: mundial groups + bracket"`

### Task 4.7: Admin panel

**Files:**
- Create: `src/routes/Admin.tsx`

- [ ] **Step 1: Implement Admin**

```tsx
// src/routes/Admin.tsx
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useState } from "react";

export default function Admin() {
  const { id, token } = useParams();
  const data = useQuery(api.quinielas.getAdmin, { adminToken: token! });
  const close = useMutation(api.quinielas.closeAndRedistribute);
  const setResult = useMutation(api.matches.setMatchResultManual);
  const [scores, setScores] = useState<Record<string, { h: string; a: string }>>({});
  if (data === undefined) return <div className="p-6 text-center">Cargando…</div>;

  const joinUrl = `${location.origin}/q/${id}/join/${data.quiniela.joinToken}`;

  return (
    <div className="mx-auto max-w-md p-4 space-y-3 pb-16">
      <h1 className="text-xl font-bold">Admin · {data.quiniela.name}</h1>
      <Card className="p-3 space-y-2">
        <div className="text-sm font-medium">Link para invitar</div>
        <div className="flex gap-2"><Input readOnly value={joinUrl} />
          <Button onClick={() => { navigator.clipboard.writeText(joinUrl); toast.success("Copiado"); }}>Copiar</Button></div>
        <div className="text-xs text-muted-foreground">{data.quiniela.filledCount}/{data.quiniela.numParticipants} · {data.quiniela.status}</div>
      </Card>

      <Card className="p-3 space-y-2">
        <div className="flex items-center justify-between"><span className="font-medium">Participantes</span>
          {data.quiniela.status === "open" &&
            <Button size="sm" onClick={async () => { await close({ adminToken: token! }); toast.success("Inscripciones cerradas"); }}>
              Cerrar y repartir</Button>}
        </div>
        {data.participants.map((p) => (
          <div key={p.personalToken} className="flex items-center justify-between text-sm">
            <span>{p.name} · {p.teamCount} equipos</span>
            <Button size="sm" variant="ghost" onClick={() => {
              navigator.clipboard.writeText(`${location.origin}/q/${id}/me/${p.personalToken}`); toast.success("Link personal copiado");
            }}>Copiar link</Button>
          </div>
        ))}
      </Card>

      <Card className="p-3 space-y-2">
        <div className="font-medium">Corregir marcador</div>
        {data.matches.filter((m) => m.homeTeam && m.awayTeam).slice(0, 30).map((m) => (
          <div key={m.externalId} className="flex items-center gap-2 text-sm">
            <span className="flex-1">{m.homeTeam!.flag} {m.homeTeam!.code} vs {m.awayTeam!.code} {m.awayTeam!.flag}</span>
            <Input className="w-12" placeholder="0" value={scores[m.externalId]?.h ?? ""} onChange={(e) =>
              setScores((s) => ({ ...s, [m.externalId]: { ...s[m.externalId], h: e.target.value } }))} />
            <Input className="w-12" placeholder="0" value={scores[m.externalId]?.a ?? ""} onChange={(e) =>
              setScores((s) => ({ ...s, [m.externalId]: { ...s[m.externalId], a: e.target.value } }))} />
            <Button size="sm" onClick={async () => {
              const s = scores[m.externalId]; if (!s) return;
              await setResult({ adminToken: token!, matchExternalId: m.externalId, homeScore: Number(s.h || 0), awayScore: Number(s.a || 0), finished: true });
              toast.success("Marcador guardado");
            }}>✓</Button>
          </div>
        ))}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Manual verify.** Open the admin link; copy join URL; close inscriptions; set a score and confirm the personal/overview screens update live.

- [ ] **Step 3: Commit.** `git add -A && git commit -m "feat: admin panel (share, close, manual results)"`

### Task 4.8: Frontend smoke test

**Files:**
- Create: `src/components/PlayerRow.test.tsx`

- [ ] **Step 1: Write a render test**

```tsx
// src/components/PlayerRow.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PlayerRow } from "./PlayerRow";

describe("PlayerRow", () => {
  it("shows alive count and name", () => {
    render(<PlayerRow p={{ participantId: "1", name: "Ana", photoUrl: null, aliveCount: 3, totalCount: 5, status: "alive" }} />);
    expect(screen.getByText("Ana")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });
});
```
Add `import "@testing-library/jest-dom";` via a `src/test-setup.ts` and reference it in `vitest.config.ts` `setupFiles`.

- [ ] **Step 2: Run, verify pass.** `npx vitest run src/components/PlayerRow.test.tsx` → PASS.

- [ ] **Step 3: Commit.** `git add -A && git commit -m "test: PlayerRow smoke test"`

---

## Phase 5 — Automatic API sync

### Task 5.1: Football API adapter

**Files:**
- Create: `convex/lib/footballData.ts`

- [ ] **Step 1: Implement adapter (football-data.org primary)**

```ts
// convex/lib/footballData.ts
// Maps football-data.org /competitions/WC responses to our internal ApiMatch shape.
const STAGE: Record<string, string> = {
  GROUP_STAGE: "group", LAST_32: "r32", LAST_16: "r16",
  QUARTER_FINALS: "qf", SEMI_FINALS: "sf", THIRD_PLACE: "third", FINAL: "final",
};
const STATUS: Record<string, string> = {
  SCHEDULED: "scheduled", TIMED: "scheduled", IN_PLAY: "live", PAUSED: "live",
  FINISHED: "finished", SUSPENDED: "scheduled", POSTPONED: "scheduled",
};

export type ApiMatch = {
  externalId: string; stage: string; group: string | null;
  homeExternalId: string | null; awayExternalId: string | null;
  kickoffAt: number; homeScore: number | null; awayScore: number | null;
  status: string; bracketSlot: string | null;
};

export function mapMatches(json: any): ApiMatch[] {
  const list = json.matches ?? [];
  return list.map((m: any, i: number): ApiMatch => {
    const stage = STAGE[m.stage] ?? "group";
    return {
      externalId: String(m.id),
      stage,
      group: m.group ? String(m.group).replace("GROUP_", "") : null,
      homeExternalId: m.homeTeam?.id ? String(m.homeTeam.id) : null,
      awayExternalId: m.awayTeam?.id ? String(m.awayTeam.id) : null,
      kickoffAt: Date.parse(m.utcDate),
      homeScore: m.score?.fullTime?.home ?? null,
      awayScore: m.score?.fullTime?.away ?? null,
      status: STATUS[m.status] ?? "scheduled",
      bracketSlot: stage === "group" ? null : `${stage}-${i}`,
    };
  });
}

export async function fetchMatches(token: string): Promise<ApiMatch[]> {
  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": token },
  });
  if (!res.ok) throw new Error(`football-data ${res.status}`);
  return mapMatches(await res.json());
}

// Fallback note: for API-Football, swap fetch URL to
// https://v3.football.api-sports.io/fixtures?league=1&season=2026 with header
// { "x-apisports-key": token } and map fixture.id/teams/goals/fixture.status.short accordingly.
```

- [ ] **Step 2: Verify build.** `npx convex dev --once` → no type errors.

- [ ] **Step 3: Commit.** `git add convex/lib/footballData.ts && git commit -m "feat: football-data.org adapter"`

### Task 5.2: syncMatches action + auto-close (TDD on the pure mapping)

**Files:**
- Create: `convex/sync.ts`
- Test: `convex/lib/footballData.test.ts`

- [ ] **Step 1: Write failing mapping test**

```ts
// convex/lib/footballData.test.ts
import { describe, it, expect } from "vitest";
import { mapMatches } from "./footballData";

describe("mapMatches", () => {
  it("maps stage, group, status and scores", () => {
    const out = mapMatches({ matches: [{
      id: 101, stage: "GROUP_STAGE", group: "GROUP_C",
      utcDate: "2026-06-13T18:00:00Z", status: "FINISHED",
      homeTeam: { id: 764 }, awayTeam: { id: 770 },
      score: { fullTime: { home: 2, away: 0 } },
    }] });
    expect(out[0]).toMatchObject({
      externalId: "101", stage: "group", group: "C", status: "finished",
      homeExternalId: "764", awayExternalId: "770", homeScore: 2, awayScore: 0,
    });
    expect(out[0].kickoffAt).toBe(Date.parse("2026-06-13T18:00:00Z"));
  });
  it("marks knockout TBD teams as null", () => {
    const out = mapMatches({ matches: [{ id: 9, stage: "FINAL", utcDate: "2026-07-19T19:00:00Z", status: "SCHEDULED", homeTeam: { id: null }, awayTeam: { id: null }, score: { fullTime: {} } }] });
    expect(out[0].stage).toBe("final");
    expect(out[0].homeExternalId).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail/pass.** `npx vitest run convex/lib/footballData.test.ts` (adapter already exists → should PASS; if a mapping bug surfaces, fix `footballData.ts`).

- [ ] **Step 3: Implement sync action**

```ts
// convex/sync.ts
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { fetchMatches } from "./lib/footballData";

export const syncMatches = internalAction({
  args: {},
  handler: async (ctx): Promise<{ ok: boolean; error?: string }> => {
    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) return { ok: false, error: "missing FOOTBALL_DATA_TOKEN" };
    try {
      const matches = await fetchMatches(token);
      for (const match of matches) {
        await ctx.runMutation(internal.matches.upsertMatchResult, { match });
      }
      await ctx.runMutation(internal.matches.recomputeTeamStates, {});
      await ctx.runMutation(internal.quinielas.autoCloseDue, {});
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  },
});
```

- [ ] **Step 4: Add autoCloseDue internal mutation**

Add to `convex/quinielas.ts`:
```ts
import { internalMutation } from "./_generated/server";

export const autoCloseDue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const firstMatch = await ctx.db.query("matches").withIndex("by_kickoff").first();
    if (!firstMatch || Date.now() < firstMatch.kickoffAt) return;
    const open = await ctx.db.query("quinielas").withIndex("by_status", (q) => q.eq("status", "open")).collect();
    for (const qn of open) {
      const participants = await ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      if (participants.length === 0) continue; // leave empty quinielas open
      // reuse redistribute logic inline (same as closeAndRedistribute body minus the token lookup)
      const owned = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      const ownedSet = new Set(owned.map((o) => o.teamId));
      const allTeams = await ctx.db.query("teams").collect();
      const leftovers = allTeams.filter((tm) => !ownedSet.has(tm._id)).map((tm) => tm._id as string);
      if (leftovers.length > 0) {
        const { balancedRedistribute } = await import("./lib/distribution");
        const counts = participants.map((p) => ({ participantId: p._id as string, count: owned.filter((o) => o.participantId === p._id).length }));
        for (const a of balancedRedistribute(leftovers, counts, Math.random)) {
          await ctx.db.insert("ownerships", { quinielaId: qn._id, teamId: a.teamId as any, participantId: a.participantId as any });
        }
      }
      await ctx.db.patch(qn._id, { status: "locked", lockedAt: Date.now() });
    }
  },
});
```
> Refactor note (DRY): extract the redistribute body shared by `closeAndRedistribute` and `autoCloseDue` into a local `async function redistribute(ctx, qn)` in `quinielas.ts` and call it from both. Keep the extracted helper covered by the existing Task 2.3 test.

- [ ] **Step 5: Run all backend tests.** `npx vitest run convex` → PASS.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat: syncMatches action + auto-close at first kickoff"`

### Task 5.3: Cron registration

**Files:**
- Create: `convex/crons.ts`

- [ ] **Step 1: Register the cron**

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("sync world cup matches", { minutes: 5 }, internal.sync.syncMatches, {});
export default crons;
```

- [ ] **Step 2: Verify push.** `npx convex dev --once` → "Convex functions ready", cron registered.

- [ ] **Step 3: Commit.** `git add convex/crons.ts && git commit -m "feat: 5-min sync cron"`

---

## Phase 6 — Deployment

### Task 6.1: Convex Cloud deploy + seed + env

- [ ] **Step 1: Set the API token in Convex**

Run: `npx convex env set FOOTBALL_DATA_TOKEN <your-token>`

- [ ] **Step 2: Deploy backend**

Run: `npx convex deploy`
Expected: prints the production deployment URL. Copy it.

- [ ] **Step 3: Seed production data**

Run a one-off: trigger `sync.syncMatches` once from the Convex dashboard (Functions → run `sync.syncMatches`), or run `seed.seedFromSnapshot` for the offline snapshot. Verify the `teams` table has 48 rows and `matches` has 104.

- [ ] **Step 4: Commit any config.** `git add -A && git commit -m "chore: prod backend config"` (no secrets committed).

### Task 6.2: Railway frontend deploy

**Files:**
- Create: `railway.json`, `package.json` serve script

- [ ] **Step 1: Add a static serve setup**

Install: `npm install -D serve`
Add script to `package.json`:
```json
"start": "serve -s dist -l ${PORT:-3000}"
```

Create `railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS", "buildCommand": "npm run build" },
  "deploy": { "startCommand": "npm run start", "restartPolicyType": "ON_FAILURE" }
}
```

- [ ] **Step 2: Configure SPA routing**

Create `serve.json` so client routes resolve to `index.html`:
```json
{ "rewrites": [{ "source": "**", "destination": "/index.html" }] }
```

- [ ] **Step 3: Deploy on Railway**

Use the `use-railway` skill (or Railway dashboard): create a project from the repo, set the env var **`VITE_CONVEX_URL`** to the production Convex URL from Task 6.1, and deploy. Confirm the public URL serves the app and creating a quiniela works end-to-end against prod Convex.

- [ ] **Step 4: Commit.** `git add railway.json serve.json package.json && git commit -m "chore: railway deploy config"`

### Task 6.3: End-to-end smoke on production

- [ ] **Step 1:** On the Railway URL: create a quiniela, open the join link in a second browser/incognito, join as 2 people, confirm random teams differ and the overview/personal/mundial screens render.
- [ ] **Step 2:** Set a manual result in admin; confirm all screens update live.
- [ ] **Step 3:** Confirm the sync cron ran (Convex dashboard logs) and updated match data.
- [ ] **Step 4 (final commit/tag).** `git commit --allow-empty -m "chore: production smoke verified" && git tag v1.0.0`

---

## Self-Review

**1. Spec coverage:**
- §3 two-layer architecture → global teams/matches + per-quiniela ownerships (Task 1.2). ✓
- §3.2 layered data (seed/sync/manual) → seedFromSnapshot (1.6), syncMatches (5.2), setMatchResultManual (1.6). ✓
- §3.3 API authority + bracket-presence fallback → computeTeamStates (1.5). ✓
- §4 schema all tables → Task 1.2. ✓
- §5 three links → tokens in create/join (2.1, 2.2), routes (4.1). ✓ Personal token in localStorage (4.4). ✓ Admin re-share personal link (4.7). ✓
- §6.1 create → 2.1/4.3. §6.2 instant assignment → 2.2/4.4. §6.3 close+redistribute → 2.3, auto-close 5.2. §6.4 sync → 5.x. §6.5 elimination+champion → recomputeTeamStates (1.6). ✓
- §7 views A/B/C/D → Personal (4.5), Overview (4.4), Mundial (4.6), Admin (4.7). ✓
- §8 deploy Railway + Convex Cloud → Phase 6. ✓
- §9 error handling: manualOverride wins (1.6), join race transactional (2.2 test), TBD teams (mapping 5.1 + UI), API down keeps state (syncMatches try/catch 5.2). ✓
- §10 testing: distribution, tournament, sync mapping, full flow via convex-test. ✓
- §11 risk #1 → Task 1.1 spike first. ✓

**Gap found & fixed:** "playing now" duels in Overview vs Personal — Overview shows duels between two owned teams (getOverview), Personal shows my teams' imminent matches (getPersonalPanel). Both implemented; no gap.

**2. Placeholder scan:** No "TBD/TODO/handle edge cases" left as code. The one external dependency (snapshot JSON contents, API token) is captured by an explicit spike task (1.1) with concrete commands, not a placeholder.

**3. Type consistency:** `OverviewData`/`PersonalData`/`MundialData`/`AdminData`/`TeamLite` defined once in `convex/types.ts`; queries annotate their return type with them; components import the same types. `ApiMatch` shape is identical in `footballData.ts` and the `apiMatch` validator in `matches.ts` (externalId, stage, group, home/awayExternalId, kickoffAt, home/awayScore, status, bracketSlot). `upsertMatchResult`/`recomputeTeamStates`/`balancedRedistribute`/`computeSlotSizes`/`drawN`/`computeTeamStates`/`computeGroupStandings` names used consistently across tasks.

**Known limitation (documented, not a v1 blocker):** manual result correction edits the *global* match row, so on a deployment hosting many quinielas it affects all of them. Fine for a single-family deploy; revisit per-quiniela overrides in v1.5.
