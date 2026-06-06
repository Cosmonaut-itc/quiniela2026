# Notificaciones (in-app + Web Push opcional) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notificaciones sin pedir correo ni celular: in-app universal (centro de avisos + badge + toasts) en la Fase 1, y Web Push opcional (con la app cerrada, vía VAPID) en la Fase 2.

**Architecture:** Los avisos se **insertan como filas** (`notifications`) en el origen del cambio. El cron (`syncMatches`) detecta eventos por quiniela con `resolveQuiniela` (aislamiento v1.5) y un `dedupeKey` determinista hace de bitácora de emite-una-vez. Las mutations existentes emiten los eventos por acción. Un único helper `insertNotification` es la costura donde la Fase 2 engancha el envío de push (`scheduler` → action Node con `web-push`). La lógica de decisión y el copy viven en un módulo puro (`convex/lib/notify.ts`), testeable con datos planos.

**Tech Stack:** Convex (queries/mutations/actions + `convex-test` edge-runtime), React 19 + TypeScript + Vite + Tailwind + `sonner`, Web Push (VAPID) con `web-push` en action Node, PWA (manifest + service worker).

**Spec:** `docs/superpowers/specs/2026-06-06-notificaciones-design.md`

---

## File structure

**Backend (Convex)**
- `convex/schema.ts` — tabla `notifications` (Task 1); tabla `pushSubscriptions` (Task 9)
- `convex/types.ts` — `NotificationItem`, `NotificationsData` (Task 1)
- `convex/lib/notify.ts` — **nuevo**, puro: `detectSyncEvents` + constructores de copy (Task 2); `deadEndpoints` se añade en `convex/lib/push.ts` (Task 9)
- `convex/lib/notify.test.ts` — **nuevo** (Task 2)
- `convex/lib/push.ts` + `convex/lib/push.test.ts` — **nuevos**, puros (Task 9)
- `convex/notifications.ts` — **nuevo**: `insertNotification` (helper), `listForParticipant`/`listForAdmin`/`markRead` (Task 3), `detectFromSync` (Task 4); `savePushSubscription`/`removePushSubscription`/`pruneSubscriptions`/`getForPush` (Task 9)
- `convex/notifications.test.ts` — **nuevo** (Tasks 3, 4, 5, 9)
- `convex/sync.ts` — llamar `detectFromSync` al final (Task 4)
- `convex/participants.ts` — eventos en `joinQuiniela` (Task 5)
- `convex/quinielas.ts` — eventos en `redistributeAndLock` (Task 5)
- `convex/push.ts` — **nuevo**, action Node `deliver` (Task 11)

**Frontend**
- `src/components/NotificationBell.tsx` — **nuevo** (Task 6)
- `src/lib/useNotificationToasts.ts` + `src/lib/useNotificationToasts.test.ts` — **nuevos** (Task 6)
- `src/routes/Personal.tsx`, `src/routes/Admin.tsx` — montar la campana (Task 6); botón opt-in push (Task 12)
- `index.html` — manifest + theme-color + apple-touch-icon (Task 10)
- `public/manifest.webmanifest`, `public/sw.js`, `public/icon-192.png`, `public/icon-512.png` — **nuevos** (Task 10)
- `src/main.tsx` — registrar el service worker (Task 10)
- `src/lib/usePushSubscription.ts`, `src/components/PushOptIn.tsx` — **nuevos** (Task 12)

---

# FASE 1 — In-app (sin PWA, sin permisos)

## Task 1: Schema `notifications` + tipos

**Files:**
- Modify: `convex/schema.ts` (añadir tabla `notifications`)
- Modify: `convex/types.ts` (añadir `NotificationItem`, `NotificationsData`)

- [ ] **Step 1: Añadir la tabla `notifications` al schema**

En `convex/schema.ts`, dentro de `defineSchema({ ... })`, después de la tabla `matchOverrides` (antes del `});` final), añade:

```ts
  // Avisos persistidos (in-app; en Fase 2 también disparan push). Una fila por aviso.
  // `dedupeKey` garantiza emite-una-vez: la detección por cron solo inserta si no existe.
  notifications: defineTable({
    quinielaId: v.id("quinielas"),
    audience: v.string(), // "participant" | "admin"
    participantId: v.optional(v.id("participants")),
    type: v.string(),
    title: v.string(),
    body: v.string(),
    matchId: v.optional(v.id("matches")),
    teamId: v.optional(v.id("teams")),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
    dedupeKey: v.string(),
  })
    .index("by_participant", ["participantId", "createdAt"])
    .index("by_quiniela_audience", ["quinielaId", "audience", "createdAt"])
    .index("by_dedupe", ["dedupeKey"]),
```

- [ ] **Step 2: Añadir los tipos de lectura**

En `convex/types.ts`, al final del archivo, añade:

```ts
export type NotificationItem = {
  id: string; type: string; title: string; body: string; createdAt: number; read: boolean;
};
export type NotificationsData = { items: NotificationItem[]; unreadCount: number };
```

- [ ] **Step 3: Regenerar tipos de Convex y verificar typecheck**

Run: `npx convex dev --once && npx tsc -p convex`
Expected: sin errores (la tabla nueva valida; `_generated` se actualiza).

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/types.ts convex/_generated
git commit -m "feat: tabla notifications + tipos de lectura de avisos"
```

---

## Task 2: Módulo puro `convex/lib/notify.ts` (decisión + copy)

**Files:**
- Create: `convex/lib/notify.ts`
- Test: `convex/lib/notify.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

Crea `convex/lib/notify.test.ts`:

```ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import {
  detectSyncEvents, teamsAssignedNotice, quinielaClosedNotice,
  playerJoinedNotice, readyToDistributeNotice,
} from "./notify";
import type { MatchRow, TeamState } from "./tournament";

const SOON = 65 * 60_000;
const tById = () => new Map([
  ["t1", { id: "t1", name: "México", flag: "🇲🇽" }],
  ["t2", { id: "t2", name: "EE.UU.", flag: "🇺🇸" }],
]);
const finishedMatch = (winner: string | null): MatchRow => ({
  _id: "m1", stage: "group", group: "A", homeTeamId: "t1", awayTeamId: "t2",
  homeScore: 2, awayScore: 1, status: "finished", winnerTeamId: winner, kickoffAt: 0,
});
const alive = (stage = "group"): TeamState => ({ alive: true, currentStage: stage });
const out = (): TeamState => ({ alive: false, currentStage: "out", eliminatedAt: 1 });

describe("detectSyncEvents", () => {
  it("emite match_result al dueño de cada equipo del partido terminado", () => {
    const intents = detectSyncEvents({
      quinielaId: "Q", now: 10_000, soonMs: SOON, tournamentStarted: false,
      teamById: tById(), effMatches: [finishedMatch("t1")],
      states: new Map([["t1", alive()], ["t2", alive()]]),
      ownerByTeam: new Map([["t1", "p1"], ["t2", "p2"]]),
      participants: [{ id: "p1", teamCount: 1 }, { id: "p2", teamCount: 1 }],
    });
    const results = intents.filter((i) => i.type === "match_result");
    expect(results).toHaveLength(2);
    expect(results.find((i) => i.participantId === "p1")!.title).toContain("ganó");
    expect(results.find((i) => i.participantId === "p2")!.title).toContain("perdió");
    expect(results[0].quinielaId).toBe("Q");
  });

  it("no emite nada para partidos sin dueño", () => {
    const intents = detectSyncEvents({
      quinielaId: "Q", now: 10_000, soonMs: SOON, tournamentStarted: false,
      teamById: tById(), effMatches: [finishedMatch("t1")],
      states: new Map([["t1", alive()], ["t2", alive()]]),
      ownerByTeam: new Map(), participants: [],
    });
    expect(intents).toHaveLength(0);
  });

  it("emite match_soon dentro de la ventana, no fuera", () => {
    const scheduled = (kickoffAt: number): MatchRow => ({
      _id: "m1", stage: "r16", group: undefined, homeTeamId: "t1", awayTeamId: "t2",
      homeScore: null, awayScore: null, status: "scheduled", winnerTeamId: null, kickoffAt,
    });
    const base = {
      quinielaId: "Q", soonMs: SOON, tournamentStarted: false, teamById: tById(),
      states: new Map([["t1", alive("r16")], ["t2", alive("r16")]]),
      ownerByTeam: new Map([["t1", "p1"], ["t2", "p2"]]),
      participants: [{ id: "p1", teamCount: 1 }, { id: "p2", teamCount: 1 }],
    };
    const now = 1_000_000;
    const within = detectSyncEvents({ ...base, now, effMatches: [scheduled(now + 30 * 60_000)] });
    expect(within.filter((i) => i.type === "match_soon")).toHaveLength(2);
    const far = detectSyncEvents({ ...base, now, effMatches: [scheduled(now + 5 * 3600_000)] });
    expect(far.filter((i) => i.type === "match_soon")).toHaveLength(0);
  });

  it("emite team_eliminated por equipo fuera y disqualified si no le queda ninguno vivo", () => {
    const intents = detectSyncEvents({
      quinielaId: "Q", now: 10_000, soonMs: SOON, tournamentStarted: false,
      teamById: tById(), effMatches: [],
      states: new Map([["t1", out()], ["t2", out()]]),
      ownerByTeam: new Map([["t1", "p1"], ["t2", "p1"]]),
      participants: [{ id: "p1", teamCount: 2 }],
    });
    expect(intents.filter((i) => i.type === "team_eliminated")).toHaveLength(2);
    expect(intents.filter((i) => i.type === "disqualified")).toHaveLength(1);
  });

  it("emite champion_won al dueño del campeón (y no lo descalifica)", () => {
    const intents = detectSyncEvents({
      quinielaId: "Q", now: 10_000, soonMs: SOON, tournamentStarted: false,
      teamById: tById(), effMatches: [],
      states: new Map([["t1", { alive: true, currentStage: "champion" }], ["t2", out()]]),
      ownerByTeam: new Map([["t1", "p1"], ["t2", "p2"]]),
      participants: [{ id: "p1", teamCount: 1 }, { id: "p2", teamCount: 1 }],
    });
    expect(intents.filter((i) => i.type === "champion_won")).toHaveLength(1);
    expect(intents.find((i) => i.type === "champion_won")!.participantId).toBe("p1");
    expect(intents.filter((i) => i.type === "disqualified" && i.participantId === "p1")).toHaveLength(0);
  });

  it("tournament_started va a todos los participantes", () => {
    const intents = detectSyncEvents({
      quinielaId: "Q", now: 10_000, soonMs: SOON, tournamentStarted: true,
      teamById: tById(), effMatches: [], states: new Map(),
      ownerByTeam: new Map([["t1", "p1"]]),
      participants: [{ id: "p1", teamCount: 1 }, { id: "p2", teamCount: 0 }],
    });
    expect(intents.filter((i) => i.type === "tournament_started")).toHaveLength(2);
  });
});

describe("constructores de copy", () => {
  it("teamsAssignedNotice usa singular/plural", () => {
    expect(teamsAssignedNotice("Q", "p1", 1).body).toContain("1 equipo");
    expect(teamsAssignedNotice("Q", "p1", 3).body).toContain("3 equipos");
  });
  it("playerJoinedNotice / readyToDistributeNotice van al admin", () => {
    expect(playerJoinedNotice("Q", "Ana", "p1").audience).toBe("admin");
    expect(readyToDistributeNotice("Q").audience).toBe("admin");
  });
  it("quinielaClosedNotice va al participante", () => {
    expect(quinielaClosedNotice("Q", "p1").audience).toBe("participant");
    expect(quinielaClosedNotice("Q", "p1").participantId).toBe("p1");
  });
});
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

Run: `npx vitest run convex/lib/notify.test.ts`
Expected: FAIL (`./notify` no existe).

- [ ] **Step 3: Implementar `convex/lib/notify.ts`**

Crea `convex/lib/notify.ts`:

```ts
import type { MatchRow, TeamState } from "./tournament";

export type Audience = "participant" | "admin";

export type NotifyIntent = {
  quinielaId: string;
  audience: Audience;
  participantId: string | null;
  type: string;
  title: string;
  body: string;
  matchId: string | null;
  teamId: string | null;
  dedupeKey: string;
};

/** Clave determinista de emite-una-vez. `ref` distingue por partido/equipo; `recipient`
 *  por destinatario ("admin" si es del admin). */
export function dedupeKey(quinielaId: string, type: string, ref: string | null, recipient: string | null): string {
  return `${quinielaId}:${type}:${ref ?? ""}:${recipient ?? "admin"}`;
}

type TeamLite = { id: string; name: string; flag: string };

export type SyncInput = {
  quinielaId: string;
  now: number;
  soonMs: number;
  tournamentStarted: boolean;
  teamById: Map<string, TeamLite>;
  effMatches: MatchRow[];
  states: Map<string, TeamState>;
  ownerByTeam: Map<string, string>; // teamId -> participantId
  participants: { id: string; teamCount: number }[];
};

export function detectSyncEvents(input: SyncInput): NotifyIntent[] {
  const { quinielaId: q, now, soonMs, tournamentStarted, teamById, effMatches, states, ownerByTeam, participants } = input;
  const out: NotifyIntent[] = [];
  const label = (id: string | null) => {
    const t = id ? teamById.get(id) : undefined;
    return t ? `${t.flag} ${t.name}` : "tu equipo";
  };

  if (tournamentStarted) {
    for (const p of participants) {
      out.push({
        quinielaId: q, audience: "participant", participantId: p.id, type: "tournament_started",
        title: "¡Arrancó el Mundial! ⚽", body: "Sigue a tus equipos en tu panel.",
        matchId: null, teamId: null, dedupeKey: dedupeKey(q, "tournament_started", null, p.id),
      });
    }
  }

  for (const mt of effMatches) {
    const pairs: [string | null, string | undefined][] = [
      [mt.homeTeamId, mt.homeTeamId ? ownerByTeam.get(mt.homeTeamId) : undefined],
      [mt.awayTeamId, mt.awayTeamId ? ownerByTeam.get(mt.awayTeamId) : undefined],
    ];

    if (mt.status !== "finished" && mt.kickoffAt >= now && mt.kickoffAt <= now + soonMs) {
      for (const [teamId, owner] of pairs) {
        if (!teamId || !owner) continue;
        const oppId = teamId === mt.homeTeamId ? mt.awayTeamId : mt.homeTeamId;
        out.push({
          quinielaId: q, audience: "participant", participantId: owner, type: "match_soon",
          title: `Pronto juega ${label(teamId)}`, body: `vs ${label(oppId)}`,
          matchId: mt._id, teamId, dedupeKey: dedupeKey(q, "match_soon", `${mt._id}:${teamId}`, owner),
        });
      }
    }

    if (mt.status === "finished" && mt.homeScore != null && mt.awayScore != null) {
      for (const [teamId, owner] of pairs) {
        if (!teamId || !owner) continue;
        const verb = mt.winnerTeamId === teamId ? "ganó" : mt.winnerTeamId ? "perdió" : "empató";
        out.push({
          quinielaId: q, audience: "participant", participantId: owner, type: "match_result",
          title: `${label(teamId)} ${verb}`, body: `Marcador: ${mt.homeScore}–${mt.awayScore}`,
          matchId: mt._id, teamId, dedupeKey: dedupeKey(q, "match_result", `${mt._id}:${teamId}`, owner),
        });
      }
    }
  }

  let championOwner: string | null = null;
  for (const [teamId, st] of states) {
    if (st.currentStage === "champion") {
      const owner = ownerByTeam.get(teamId);
      if (owner) {
        championOwner = owner;
        out.push({
          quinielaId: q, audience: "participant", participantId: owner, type: "champion_won",
          title: "🏆 ¡Ganaste!", body: `${label(teamId)} es campeón. ¡El premio es tuyo!`,
          matchId: null, teamId, dedupeKey: dedupeKey(q, "champion_won", null, owner),
        });
      }
    }
  }

  for (const [teamId, owner] of ownerByTeam) {
    const st = states.get(teamId);
    if (st && !st.alive && st.currentStage === "out") {
      out.push({
        quinielaId: q, audience: "participant", participantId: owner, type: "team_eliminated",
        title: `${label(teamId)} quedó eliminado`, body: "Salió del torneo.",
        matchId: null, teamId, dedupeKey: dedupeKey(q, "team_eliminated", teamId, owner),
      });
    }
  }

  for (const p of participants) {
    if (p.id === championOwner) continue;
    const myTeams = [...ownerByTeam.entries()].filter(([, o]) => o === p.id).map(([t]) => t);
    if (myTeams.length === 0) continue;
    const anyAlive = myTeams.some((t) => states.get(t)?.alive);
    if (!anyAlive) {
      out.push({
        quinielaId: q, audience: "participant", participantId: p.id, type: "disqualified",
        title: "Quedaste fuera 😕", body: "Todos tus equipos salieron del torneo.",
        matchId: null, teamId: null, dedupeKey: dedupeKey(q, "disqualified", null, p.id),
      });
    }
  }

  return out;
}

export function teamsAssignedNotice(quinielaId: string, participantId: string, teamCount: number): NotifyIntent {
  return {
    quinielaId, audience: "participant", participantId, type: "teams_assigned",
    title: "¡Ya tienes tus equipos! 🎲",
    body: `Te tocaron ${teamCount} ${teamCount === 1 ? "equipo" : "equipos"}. Míralos en tu panel.`,
    matchId: null, teamId: null, dedupeKey: dedupeKey(quinielaId, "teams_assigned", null, participantId),
  };
}

export function quinielaClosedNotice(quinielaId: string, participantId: string): NotifyIntent {
  return {
    quinielaId, audience: "participant", participantId, type: "quiniela_closed",
    title: "La quiniela se cerró 🔒", body: "Ya están repartidos todos los equipos. ¡Suerte!",
    matchId: null, teamId: null, dedupeKey: dedupeKey(quinielaId, "quiniela_closed", null, participantId),
  };
}

export function playerJoinedNotice(quinielaId: string, joinerName: string, participantId: string): NotifyIntent {
  return {
    quinielaId, audience: "admin", participantId: null, type: "player_joined",
    title: "Nuevo participante 👋", body: `${joinerName} se unió a tu quiniela.`,
    matchId: null, teamId: null, dedupeKey: dedupeKey(quinielaId, "player_joined", participantId, null),
  };
}

export function readyToDistributeNotice(quinielaId: string): NotifyIntent {
  return {
    quinielaId, audience: "admin", participantId: null, type: "ready_to_distribute",
    title: "¡Ya están todos! ✅", body: "Tu quiniela está llena; puedes repartir o cerrar.",
    matchId: null, teamId: null, dedupeKey: dedupeKey(quinielaId, "ready_to_distribute", null, null),
  };
}
```

- [ ] **Step 4: Correr las pruebas para verificar que pasan**

Run: `npx vitest run convex/lib/notify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/notify.ts convex/lib/notify.test.ts
git commit -m "feat: módulo puro de decisión y copy de notificaciones"
```

---

## Task 3: `notifications.ts` — helper de inserción + lectura/marcado

**Files:**
- Create: `convex/notifications.ts`
- Test: `convex/notifications.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

Crea `convex/notifications.test.ts`:

```ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

async function quinielaWithPlayer() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seedFromSnapshot, {});
  const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4 });
  const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
  return { t, q, personalToken: a.personalToken };
}

describe("lectura y marcado de avisos", () => {
  it("listForParticipant devuelve items y unreadCount; markRead los marca", async () => {
    const { t, q, personalToken } = await quinielaWithPlayer();
    // joinQuiniela aún no emite avisos (eso es Task 5); inserto uno directo para probar lectura.
    const me = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_personalToken", (x) => x.eq("personalToken", personalToken)).first());
    await t.run((ctx) => ctx.db.insert("notifications", {
      quinielaId: q.quinielaId, audience: "participant", participantId: me!._id,
      type: "test", title: "Hola", body: "Mundo", createdAt: Date.now(), dedupeKey: "k1",
    }));
    let list = await t.query(api.notifications.listForParticipant, { personalToken });
    expect(list.items).toHaveLength(1);
    expect(list.unreadCount).toBe(1);
    await t.mutation(api.notifications.markRead, { personalToken });
    list = await t.query(api.notifications.listForParticipant, { personalToken });
    expect(list.unreadCount).toBe(0);
    expect(list.items[0].read).toBe(true);
  });

  it("listForAdmin devuelve solo los avisos de audiencia admin de esa quiniela", async () => {
    const { t, q } = await quinielaWithPlayer();
    await t.run((ctx) => ctx.db.insert("notifications", {
      quinielaId: q.quinielaId, audience: "admin",
      type: "player_joined", title: "Nuevo", body: "x", createdAt: Date.now(), dedupeKey: "k2",
    }));
    const list = await t.query(api.notifications.listForAdmin, { adminToken: q.adminToken });
    expect(list.items.some((n) => n.type === "player_joined")).toBe(true);
  });

  it("listForParticipant lanza con token inválido", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    await expect(t.query(api.notifications.listForParticipant, { personalToken: "no-existe" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

Run: `npx vitest run convex/notifications.test.ts`
Expected: FAIL (`api.notifications.*` no existe).

- [ ] **Step 3: Implementar `convex/notifications.ts` (helper + lectura/marcado)**

Crea `convex/notifications.ts`:

```ts
import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { NotificationItem, NotificationsData } from "./types";
import type { NotifyIntent } from "./lib/notify";

/** Inserta un aviso si no existe ya uno con su dedupeKey (emite-una-vez). Costura única:
 *  la Fase 2 añadirá aquí el disparo de push tras insertar. */
export async function insertNotification(ctx: MutationCtx, intent: NotifyIntent): Promise<void> {
  const dupe = await ctx.db.query("notifications")
    .withIndex("by_dedupe", (q) => q.eq("dedupeKey", intent.dedupeKey)).first();
  if (dupe) return;
  await ctx.db.insert("notifications", {
    quinielaId: intent.quinielaId as Id<"quinielas">,
    audience: intent.audience,
    participantId: intent.participantId ? (intent.participantId as Id<"participants">) : undefined,
    type: intent.type,
    title: intent.title,
    body: intent.body,
    matchId: intent.matchId ? (intent.matchId as Id<"matches">) : undefined,
    teamId: intent.teamId ? (intent.teamId as Id<"teams">) : undefined,
    createdAt: Date.now(),
    dedupeKey: intent.dedupeKey,
  });
}

const toItem = (n: Doc<"notifications">): NotificationItem => ({
  id: n._id as string, type: n.type, title: n.title, body: n.body,
  createdAt: n.createdAt, read: n.readAt != null,
});

export const listForParticipant = query({
  args: { personalToken: v.string() },
  handler: async (ctx, args): Promise<NotificationsData> => {
    const me = await ctx.db.query("participants")
      .withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken)).first();
    if (!me) throw new Error("Jugador no encontrado");
    const rows = await ctx.db.query("notifications")
      .withIndex("by_participant", (q) => q.eq("participantId", me._id)).order("desc").take(50);
    return { items: rows.map(toItem), unreadCount: rows.filter((r) => r.readAt == null).length };
  },
});

export const listForAdmin = query({
  args: { adminToken: v.string() },
  handler: async (ctx, args): Promise<NotificationsData> => {
    const qn = await ctx.db.query("quinielas")
      .withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    const rows = await ctx.db.query("notifications")
      .withIndex("by_quiniela_audience", (q) => q.eq("quinielaId", qn._id).eq("audience", "admin"))
      .order("desc").take(50);
    return { items: rows.map(toItem), unreadCount: rows.filter((r) => r.readAt == null).length };
  },
});

export const markRead = mutation({
  args: { personalToken: v.optional(v.string()), adminToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    let rows: Doc<"notifications">[];
    if (args.personalToken) {
      const me = await ctx.db.query("participants")
        .withIndex("by_personalToken", (q) => q.eq("personalToken", args.personalToken!)).first();
      if (!me) throw new Error("Jugador no encontrado");
      rows = await ctx.db.query("notifications")
        .withIndex("by_participant", (q) => q.eq("participantId", me._id)).collect();
    } else if (args.adminToken) {
      const qn = await ctx.db.query("quinielas")
        .withIndex("by_adminToken", (q) => q.eq("adminToken", args.adminToken!)).first();
      if (!qn) throw new Error("Quiniela no encontrada");
      rows = await ctx.db.query("notifications")
        .withIndex("by_quiniela_audience", (q) => q.eq("quinielaId", qn._id).eq("audience", "admin")).collect();
    } else {
      throw new Error("Falta token");
    }
    for (const r of rows) if (r.readAt == null) await ctx.db.patch(r._id, { readAt: now });
    return { ok: true as const };
  },
});
```

- [ ] **Step 4: Regenerar tipos de Convex**

Run: `npx convex dev --once`
Expected: `_generated` reconoce `api.notifications.*`.

- [ ] **Step 5: Correr las pruebas para verificar que pasan**

Run: `npx vitest run convex/notifications.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add convex/notifications.ts convex/notifications.test.ts convex/_generated
git commit -m "feat: avisos in-app — inserción idempotente + lectura/marcado"
```

---

## Task 4: Detección por cron (`detectFromSync`) + enganche en `syncMatches`

**Files:**
- Modify: `convex/notifications.ts` (añadir `detectFromSync`)
- Modify: `convex/sync.ts` (llamar `detectFromSync`)
- Test: `convex/notifications.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

En `convex/notifications.test.ts`, añade los helpers (debajo de `quinielaWithPlayer`) y un nuevo bloque:

```ts
type T = ReturnType<typeof convexTest>;
async function closedSolo(t: T, name: string) {
  const q = await t.mutation(api.quinielas.createQuiniela, { name, prizeText: "$1", numParticipants: 1 });
  await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: `${name}-p` });
  await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
  return q;
}
async function assignKnockout(t: T) {
  const km = await t.run((ctx) => ctx.db.query("matches").filter((q) => q.neq(q.field("stage"), "group")).first());
  await t.mutation(internal.matches.upsertMatchResult, {
    match: { externalId: km!.externalId, stage: km!.stage, group: null,
      homeExternalId: "758", awayExternalId: "759", kickoffAt: km!.kickoffAt,
      homeScore: null, awayScore: null, status: "scheduled", winnerExternalId: null, bracketSlot: km!.bracketSlot ?? null } });
  return km!.externalId;
}
const tokenOf = (t: T, quinielaId: string) =>
  t.run((ctx) => ctx.db.query("participants").withIndex("by_quiniela", (q) => q.eq("quinielaId", quinielaId as never)).first())
    .then((p) => p!.personalToken);

describe("detectFromSync (cron)", () => {
  it("AISLAMIENTO: un override que elimina en A genera team_eliminated solo en A, e idempotente", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const ext = await assignKnockout(t);
    const a = await closedSolo(t, "A"); const b = await closedSolo(t, "B");
    await t.mutation(api.matches.setMatchResultManual, {
      adminToken: a.adminToken, matchExternalId: ext, homeScore: 1, awayScore: 0, finished: true }); // 759 fuera en A
    await t.mutation(internal.notifications.detectFromSync, {});
    const listA = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, a.quinielaId) });
    const listB = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, b.quinielaId) });
    expect(listA.items.some((n) => n.type === "team_eliminated")).toBe(true);
    expect(listB.items.some((n) => n.type === "team_eliminated")).toBe(false);
    const before = listA.items.length;
    await t.mutation(internal.notifications.detectFromSync, {});
    const listA2 = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, a.quinielaId) });
    expect(listA2.items.length).toBe(before); // no duplica
  });

  it("match_soon avisa al dueño cuando el kickoff cae en la ventana", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const ext = await assignKnockout(t);
    const a = await closedSolo(t, "A");
    const m = await t.run((ctx) => ctx.db.query("matches").withIndex("by_externalId", (q) => q.eq("externalId", ext)).first());
    await t.run((ctx) => ctx.db.patch(m!._id, { kickoffAt: Date.now() + 30 * 60_000, status: "scheduled" }));
    await t.mutation(internal.notifications.detectFromSync, {});
    const list = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, a.quinielaId) });
    expect(list.items.some((n) => n.type === "match_soon")).toBe(true);
  });

  it("champion_won al dueño del campeón derivado por quiniela", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const fm = await t.run((ctx) => ctx.db.query("matches").withIndex("by_stage_kickoff", (q) => q.eq("stage", "final")).first());
    await t.mutation(internal.matches.upsertMatchResult, {
      match: { externalId: fm!.externalId, stage: "final", group: null, homeExternalId: "758", awayExternalId: "759",
        kickoffAt: fm!.kickoffAt, homeScore: 1, awayScore: 0, status: "finished", winnerExternalId: "758", bracketSlot: fm!.bracketSlot ?? null } });
    const a = await closedSolo(t, "A");
    await t.mutation(internal.notifications.detectFromSync, {});
    const list = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, a.quinielaId) });
    expect(list.items.some((n) => n.type === "champion_won")).toBe(true);
  });

  it("tournament_started a todos cuando ya arrancó el primer partido", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const a = await closedSolo(t, "A");
    const first = await t.run((ctx) => ctx.db.query("matches").withIndex("by_kickoff").first());
    await t.run((ctx) => ctx.db.patch(first!._id, { kickoffAt: Date.now() - 60_000 }));
    await t.mutation(internal.notifications.detectFromSync, {});
    const list = await t.query(api.notifications.listForParticipant, { personalToken: await tokenOf(t, a.quinielaId) });
    expect(list.items.some((n) => n.type === "tournament_started")).toBe(true);
  });
});
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

Run: `npx vitest run convex/notifications.test.ts -t detectFromSync`
Expected: FAIL (`internal.notifications.detectFromSync` no existe).

- [ ] **Step 3: Implementar `detectFromSync`**

En `convex/notifications.ts`, añade el import de `internalMutation`, `resolveQuiniela`, `detectSyncEvents` y la mutación. Cambia la primera línea de import por:

```ts
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
```

Y añade, junto a los otros imports:

```ts
import { resolveQuiniela } from "./lib/perQuiniela";
import { detectSyncEvents } from "./lib/notify";

const SOON_MS = 65 * 60_000;
```

Al final del archivo, añade:

```ts
/** Recorre las quinielas, deriva su estado efectivo (con overrides) e inserta los avisos
 *  por sincronización que falten. Se llama al final de syncMatches. */
export const detectFromSync = internalMutation({
  args: {},
  handler: async (ctx) => {
    const firstMatch = await ctx.db.query("matches").withIndex("by_kickoff").first();
    const now = Date.now();
    const tournamentStarted = !!firstMatch && now >= firstMatch.kickoffAt;
    const quinielas = await ctx.db.query("quinielas").collect();
    for (const qn of quinielas) {
      const ownerships = await ctx.db.query("ownerships")
        .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      if (ownerships.length === 0) continue; // sin equipos repartidos no hay nada que avisar
      const { teamById, effRows, states } = await resolveQuiniela(ctx, qn._id);
      const participants = await ctx.db.query("participants")
        .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      const teamLiteById = new Map(
        [...teamById].map(([id, tm]) => [id as string, { id: id as string, name: tm.name, flag: tm.flag }]));
      const ownerByTeam = new Map<string, string>(
        ownerships.map((o) => [o.teamId as string, o.participantId as string]));
      const pInput = participants.map((p) => ({
        id: p._id as string, teamCount: ownerships.filter((o) => o.participantId === p._id).length }));
      const intents = detectSyncEvents({
        quinielaId: qn._id as string, now, soonMs: SOON_MS, tournamentStarted,
        teamById: teamLiteById, effMatches: effRows, states, ownerByTeam, participants: pInput,
      });
      for (const intent of intents) await insertNotification(ctx, intent);
    }
  },
});
```

- [ ] **Step 4: Enganchar `detectFromSync` en `syncMatches`**

En `convex/sync.ts`, dentro del `try`, justo después de `await ctx.runMutation(internal.quinielas.autoCloseDue, {});`, añade:

```ts
      await ctx.runMutation(internal.notifications.detectFromSync, {});
```

- [ ] **Step 5: Correr las pruebas para verificar que pasan**

Run: `npx vitest run convex/notifications.test.ts`
Expected: PASS.

- [ ] **Step 6: Verificar typecheck del backend**

Run: `npx convex dev --once && npx tsc -p convex`
Expected: sin errores. (Si `tsc` se queja de pasar `MutationCtx` a `resolveQuiniela`, abre `convex/lib/perQuiniela.ts` y cambia el tipo del parámetro `ctx: QueryCtx` por `ctx: QueryCtx | MutationCtx`, importando `MutationCtx` de `../_generated/server`. En la práctica `MutationCtx` es asignable a `QueryCtx`, así que normalmente no hace falta.)

- [ ] **Step 7: Commit**

```bash
git add convex/notifications.ts convex/sync.ts convex/notifications.test.ts convex/_generated
git commit -m "feat: detección de avisos por cron (aislada por quiniela, idempotente)"
```

---

## Task 5: Eventos por acción (join / cierre)

**Files:**
- Modify: `convex/participants.ts` (`joinQuiniela`)
- Modify: `convex/quinielas.ts` (`redistributeAndLock`)
- Test: `convex/notifications.test.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

En `convex/notifications.test.ts`, añade un bloque:

```ts
describe("eventos por acción", () => {
  it("joinQuiniela avisa al admin (player_joined) y al jugador (teams_assigned en on_join)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4 });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const adminList = await t.query(api.notifications.listForAdmin, { adminToken: q.adminToken });
    expect(adminList.items.some((n) => n.type === "player_joined")).toBe(true);
    const meList = await t.query(api.notifications.listForParticipant, { personalToken: a.personalToken });
    expect(meList.items.some((n) => n.type === "teams_assigned")).toBe(true);
  });

  it("ready_to_distribute cuando la quiniela se llena", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 1 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const adminList = await t.query(api.notifications.listForAdmin, { adminToken: q.adminToken });
    expect(adminList.items.some((n) => n.type === "ready_to_distribute")).toBe(true);
  });

  it("closeAndRedistribute avisa quiniela_closed a todos; on_reveal añade teams_assigned", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "F", prizeText: "$1", numParticipants: 4, assignMode: "on_reveal" });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    let meList = await t.query(api.notifications.listForParticipant, { personalToken: a.personalToken });
    expect(meList.items.some((n) => n.type === "teams_assigned")).toBe(false); // aún no recibe equipos
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    meList = await t.query(api.notifications.listForParticipant, { personalToken: a.personalToken });
    expect(meList.items.some((n) => n.type === "quiniela_closed")).toBe(true);
    expect(meList.items.some((n) => n.type === "teams_assigned")).toBe(true);
  });
});
```

- [ ] **Step 2: Correr las pruebas para verificar que fallan**

Run: `npx vitest run convex/notifications.test.ts -t "eventos por acción"`
Expected: FAIL (las mutations aún no emiten avisos).

- [ ] **Step 3: Emitir avisos en `joinQuiniela`**

En `convex/participants.ts`, añade a los imports del inicio:

```ts
import { insertNotification } from "./notifications";
import { playerJoinedNotice, teamsAssignedNotice, readyToDistributeNotice } from "./lib/notify";
```

Dentro de `joinQuiniela`, **reemplaza** este bloque:

```ts
    const personalToken = newToken();
    const participantId = await ctx.db.insert("participants", {
      quinielaId: qn._id, name: args.name.trim().slice(0, 40),
      photoId: args.photoId, personalToken, slotIndex: k, joinedAt: Date.now(),
    });

    // on_reveal: no teams until the admin reveals. on_join (default): draw a slot-sized
    // batch from the still-unowned pool right now.
    if (qn.assignMode !== "on_reveal") {
      const size = qn.slotSizes[k];
      const owned = await ctx.db.query("ownerships").withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
      const ownedSet = new Set(owned.map((o) => o.teamId));
      const allTeams = await ctx.db.query("teams").collect();
      const pool = allTeams.filter((tm) => !ownedSet.has(tm._id)).map((tm) => tm._id);
      const { picked } = drawN(pool, size, Math.random);
      for (const teamId of picked) {
        await ctx.db.insert("ownerships", { quinielaId: qn._id, teamId, participantId });
      }
    }
    return { personalToken };
```

por:

```ts
    const name = args.name.trim().slice(0, 40);
    const personalToken = newToken();
    const participantId = await ctx.db.insert("participants", {
      quinielaId: qn._id, name,
      photoId: args.photoId, personalToken, slotIndex: k, joinedAt: Date.now(),
    });

    // on_reveal: no teams until the admin reveals. on_join (default): draw a slot-sized
    // batch from the still-unowned pool right now.
    let assignedCount = 0;
    if (qn.assignMode !== "on_reveal") {
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

    // Avisos: al admin (alguien se unió) y, si recibió equipos, al jugador. Si se llenó, al admin.
    await insertNotification(ctx, playerJoinedNotice(qn._id, name, participantId));
    if (assignedCount > 0) await insertNotification(ctx, teamsAssignedNotice(qn._id, participantId, assignedCount));
    if (k + 1 >= qn.numParticipants) await insertNotification(ctx, readyToDistributeNotice(qn._id));

    return { personalToken };
```

- [ ] **Step 4: Emitir avisos en `redistributeAndLock`**

En `convex/quinielas.ts`, añade a los imports del inicio:

```ts
import { insertNotification } from "./notifications";
import { quinielaClosedNotice, teamsAssignedNotice } from "./lib/notify";
```

En la función `redistributeAndLock`, **reemplaza** la última línea:

```ts
  await ctx.db.patch(qn._id, { status: "locked", lockedAt: Date.now() });
}
```

por:

```ts
  await ctx.db.patch(qn._id, { status: "locked", lockedAt: Date.now() });

  // Avisos: la quiniela se cerró (a todos); en on_reveal recién recibieron equipos.
  const isReveal = modeOf(qn) === "on_reveal";
  const finalOwned = await ctx.db.query("ownerships")
    .withIndex("by_quiniela", (q) => q.eq("quinielaId", qn._id)).collect();
  for (const p of participants) {
    await insertNotification(ctx, quinielaClosedNotice(qn._id, p._id));
    if (isReveal) {
      const teamCount = finalOwned.filter((o) => o.participantId === p._id).length;
      await insertNotification(ctx, teamsAssignedNotice(qn._id, p._id, teamCount));
    }
  }
}
```

- [ ] **Step 5: Correr las pruebas para verificar que pasan**

Run: `npx vitest run convex/notifications.test.ts`
Expected: PASS.

- [ ] **Step 6: Correr toda la suite del backend (regresión)**

Run: `npx vitest run convex/ && npx convex dev --once && npx tsc -p convex`
Expected: PASS y typecheck limpio. (Las pruebas existentes de `joinQuiniela`/`overrides` deben seguir verdes; la lógica de reparto no cambió.)

- [ ] **Step 7: Commit**

```bash
git add convex/participants.ts convex/quinielas.ts convex/notifications.test.ts
git commit -m "feat: avisos por acción (alguien se unió, equipos asignados, quiniela cerrada)"
```

---

## Task 6: Frontend in-app (campana + toasts)

**Files:**
- Create: `src/components/NotificationBell.tsx`
- Create: `src/lib/useNotificationToasts.ts`
- Test: `src/lib/useNotificationToasts.test.ts`
- Modify: `src/routes/Personal.tsx`, `src/routes/Admin.tsx`

- [ ] **Step 1: Escribir la prueba que falla del hook de toasts**

Crea `src/lib/useNotificationToasts.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: vi.fn() }));
import { toast } from "sonner";
import { useNotificationToasts } from "./useNotificationToasts";

type Item = { id: string; type: string; title: string; body: string; createdAt: number; read: boolean };
const item = (id: string, createdAt: number): Item => ({ id, type: "x", title: `T${id}`, body: "b", createdAt, read: false });

describe("useNotificationToasts", () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it("no anuncia lo viejo en la primera carga; sí anuncia lo nuevo después", () => {
    const { rerender } = renderHook(
      ({ items }) => useNotificationToasts("Q", "me", items),
      { initialProps: { items: [item("1", 100)] as Item[] } });
    expect(toast).not.toHaveBeenCalled();
    rerender({ items: [item("2", 200), item("1", 100)] });
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("no hace nada sin items", () => {
    renderHook(() => useNotificationToasts("Q", "me", undefined));
    expect(toast).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr la prueba para verificar que falla**

Run: `npx vitest run src/lib/useNotificationToasts.test.ts`
Expected: FAIL (`./useNotificationToasts` no existe).

- [ ] **Step 3: Implementar el hook de toasts**

Crea `src/lib/useNotificationToasts.ts`:

```ts
import { useEffect } from "react";
import { toast } from "sonner";
import type { NotificationItem } from "@/../convex/types";

/**
 * Dispara un toast por cada aviso más nuevo que el último visto (persistido en
 * localStorage por quiniela + tipo de panel). En la primera vez (sin corte previo)
 * solo fija el corte, para no anunciar el historial al cargar.
 */
export function useNotificationToasts(
  quinielaId: string | undefined,
  kind: "me" | "admin",
  items: NotificationItem[] | undefined,
) {
  useEffect(() => {
    if (!quinielaId || !items || items.length === 0) return;
    const key = `quiniela:${quinielaId}:notifseen:${kind}`;
    let last = 0;
    try { last = Number(localStorage.getItem(key) ?? 0) || 0; } catch { /* storage no disponible */ }
    const newest = items.reduce((m, n) => Math.max(m, n.createdAt), 0);
    if (last === 0) {
      try { localStorage.setItem(key, String(newest)); } catch { /* */ }
      return;
    }
    const fresh = items.filter((n) => n.createdAt > last).sort((a, b) => a.createdAt - b.createdAt);
    for (const n of fresh) toast(n.title, { description: n.body });
    if (newest > last) { try { localStorage.setItem(key, String(newest)); } catch { /* */ } }
  }, [quinielaId, kind, items]);
}
```

- [ ] **Step 4: Correr la prueba para verificar que pasa**

Run: `npx vitest run src/lib/useNotificationToasts.test.ts`
Expected: PASS.

- [ ] **Step 5: Crear el componente `NotificationBell`**

Crea `src/components/NotificationBell.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useNotificationToasts } from "@/lib/useNotificationToasts";
import { cn } from "@/lib/utils";

/**
 * Campana con badge de no leídos + panel desplegable de avisos. Se usa en el panel
 * personal (kind="me", token = personalToken) y en el admin (kind="admin", token = adminToken).
 * También dispara los toasts de lo nuevo vía useNotificationToasts.
 */
export function NotificationBell({
  quinielaId, token, kind,
}: { quinielaId: string; token: string; kind: "me" | "admin" }) {
  const meData = useQuery(api.notifications.listForParticipant, kind === "me" ? { personalToken: token } : "skip");
  const adminData = useQuery(api.notifications.listForAdmin, kind === "admin" ? { adminToken: token } : "skip");
  const data = kind === "me" ? meData : adminData;
  const markRead = useMutation(api.notifications.markRead);
  const [open, setOpen] = useState(false);

  useNotificationToasts(quinielaId, kind, data?.items);

  const unread = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  async function onToggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await markRead(kind === "me" ? { personalToken: token } : { adminToken: token });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void onToggle()}
        aria-label={`Avisos${unread > 0 ? ` (${unread} sin leer)` : ""}`}
        className="relative grid size-9 place-items-center rounded-full border border-border bg-card/80 text-lg backdrop-blur"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.6rem] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar avisos"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 max-h-[70svh] w-72 overflow-y-auto rounded-2xl border border-border bg-popover/95 p-2 shadow-xl backdrop-blur-xl">
            {items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Sin avisos todavía.</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "rounded-xl px-3 py-2.5",
                    n.read ? "opacity-70" : "bg-secondary/60",
                  )}
                >
                  <div className="text-sm font-semibold">{n.title}</div>
                  <div className="text-[0.78rem] text-muted-foreground">{n.body}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Montar la campana en el panel personal**

En `src/routes/Personal.tsx`:

1. Añade el import (junto a los otros de `@/components/...`):

```tsx
import { NotificationBell } from "@/components/NotificationBell";
```

2. En el header, **reemplaza**:

```tsx
          <StatusBadge
            status={me.status}
            label={statusLabel}
            className="shrink-0 self-start"
          />
```

por:

```tsx
          <div className="flex shrink-0 items-center gap-2 self-start">
            <NotificationBell quinielaId={id!} token={token!} kind="me" />
            <StatusBadge status={me.status} label={statusLabel} />
          </div>
```

- [ ] **Step 7: Montar la campana en el panel admin**

En `src/routes/Admin.tsx`:

1. Añade el import (junto a los otros de `@/components/...`):

```tsx
import { NotificationBell } from "@/components/NotificationBell";
```

2. En el header (`<header className="grain bg-pitch relative ...">`), justo después de la etiqueta `<h1>…</h1>` de cierre y antes de `</header>`, añade:

```tsx
        <div className="absolute top-6 right-4">
          <NotificationBell quinielaId={id!} token={token!} kind="admin" />
        </div>
```

- [ ] **Step 8: Verificar build, lint y toda la suite**

Run: `npm run build && npm run lint && npm test`
Expected: build limpio, lint limpio, tests verdes.

- [ ] **Step 9: Commit**

```bash
git add src/components/NotificationBell.tsx src/lib/useNotificationToasts.ts src/lib/useNotificationToasts.test.ts src/routes/Personal.tsx src/routes/Admin.tsx
git commit -m "feat: campana de avisos in-app + toasts en panel personal y admin"
```

---

## Task 7: Validación E2E Fase 1 y despliegue

**Files:** ninguno (validación manual con Playwright contra dev).

- [ ] **Step 1: Levantar el stack local de dev**

Run (en terminales separadas):
- `npx convex dev` (empuja schema/funciones a dev y queda escuchando)
- `npm run dev` (Vite en :5173)

- [ ] **Step 2: E2E — aislamiento in-app entre quinielas**

Con Playwright MCP:
1. Crear dos quinielas A y B (1 participante cada una) y cerrarlas (reparte los 48 a su único jugador).
2. En el panel admin de A, corregir un partido de eliminatoria con equipos definidos (eliminar a un equipo).
3. Disparar la detección: `npx convex run notifications:detectFromSync '{}'`.
4. Abrir el panel personal de A → la campana muestra badge > 0 y el feed incluye "quedó eliminado".
5. Abrir el panel personal de B → la campana **no** muestra ese aviso (aislamiento).
6. Verificar 0 errores de consola.

- [ ] **Step 3: E2E — eventos por acción y toasts**

1. Crear una quiniela on_reveal con 2 lugares; unir a "Ana" y "Beto".
2. En el panel admin, la campana muestra "Nuevo participante" (player_joined) y, al llenarse, "¡Ya están todos!".
3. Repartir (cerrar) → en el panel personal de Ana aparece un toast y, en la campana, "La quiniela se cerró" + "¡Ya tienes tus equipos!".

- [ ] **Step 4: Verificación final**

Run: `npm test && npm run build && npm run lint && npx tsc -p convex && npx tsc`
Expected: todo verde.

- [ ] **Step 5: Despliegue (solo cuando el usuario lo autorice)**

Orden obligatorio **backend antes que frontend**:
- `npx convex deploy --yes`
- `railway up --service quiniela2026`

(No desplegar sin confirmación explícita. Antes de ramificar/mergear: `git fetch` + revisar `git log main` por sesiones concurrentes.)

---

# FASE 2 — Web Push (opt-in, con la app cerrada)

## Task 8: De-risk — verificar `web-push` en una action Node de Convex

**Files:**
- Modify: `package.json` (dependencias)
- Create temporal: `convex/push.ts` (spike; se reemplaza en Task 11)

- [ ] **Step 1: Instalar dependencias**

Run: `npm install web-push && npm install -D @types/web-push`
Expected: se añaden a `package.json`.

- [ ] **Step 2: Generar el par de claves VAPID**

Run: `npx web-push generate-vapid-keys`
Expected: imprime `Public Key:` y `Private Key:`. **Guárdalas** (se usan en Task 11 y en el opt-in). No las commitees.

- [ ] **Step 3: Crear un spike de action Node**

Crea `convex/push.ts`:

```ts
"use node";
import { internalAction } from "./_generated/server";

// Spike temporal: confirma que web-push se puede importar y correr en el runtime Node de
// Convex. Import dinámico para NO arrastrar dependencias de Node al cargar el módulo bajo
// edge-runtime en los tests (convex-test importa todos los módulos vía glob).
export const spike = internalAction({
  args: {},
  handler: async (): Promise<{ ok: boolean; hasPublic: boolean }> => {
    const webpush = (await import("web-push")).default;
    const keys = webpush.generateVAPIDKeys();
    return { ok: true, hasPublic: typeof keys.publicKey === "string" };
  },
});
```

- [ ] **Step 4: Empujar y ejecutar el spike contra dev**

Run: `npx convex dev --once && npx convex run push:spike '{}'`
Expected: `{ ok: true, hasPublic: true }`.

**Si falla** (web-push no bundlea o no corre): **plan B** — implementar el cifrado de Web Push (RFC 8291) y la firma VAPID con `Web Crypto` en el runtime default. Documenta el resultado y ajusta Task 11 en consecuencia antes de continuar.

- [ ] **Step 5: Verificar que la suite sigue verde (el módulo "use node" no la rompe)**

Run: `npx vitest run convex/`
Expected: PASS (el import dinámico evita cargar web-push bajo edge-runtime).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json convex/push.ts convex/_generated
git commit -m "chore: web-push + spike de action Node (de-risk Fase 2)"
```

---

## Task 9: Suscripciones push — schema, mutations y poda (pura)

**Files:**
- Modify: `convex/schema.ts` (tabla `pushSubscriptions`)
- Create: `convex/lib/push.ts`, `convex/lib/push.test.ts`
- Modify: `convex/notifications.ts` (`savePushSubscription`, `removePushSubscription`, `pruneSubscriptions`, `getForPush`)
- Test: `convex/notifications.test.ts`

- [ ] **Step 1: Escribir la prueba que falla de la poda (pura)**

Crea `convex/lib/push.test.ts`:

```ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { deadEndpoints } from "./push";

describe("deadEndpoints", () => {
  it("marca para borrar solo 404/410", () => {
    expect(deadEndpoints([
      { endpoint: "a", statusCode: 201 },
      { endpoint: "b", statusCode: 410 },
      { endpoint: "c", statusCode: 404 },
      { endpoint: "d", statusCode: 500 },
    ])).toEqual(["b", "c"]);
  });
});
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npx vitest run convex/lib/push.test.ts`
Expected: FAIL (`./push` no existe).

- [ ] **Step 3: Implementar `convex/lib/push.ts`**

Crea `convex/lib/push.ts`:

```ts
/** Endpoints cuya suscripción ya no existe (Not Found / Gone) y deben borrarse. */
export function deadEndpoints(results: { endpoint: string; statusCode: number }[]): string[] {
  return results.filter((r) => r.statusCode === 404 || r.statusCode === 410).map((r) => r.endpoint);
}
```

- [ ] **Step 4: Correr para verificar que pasa**

Run: `npx vitest run convex/lib/push.test.ts`
Expected: PASS.

- [ ] **Step 5: Añadir la tabla `pushSubscriptions` al schema**

En `convex/schema.ts`, después de la tabla `notifications`, añade:

```ts
  // Suscripción de Web Push (anónima del navegador), atada a un participante o al admin.
  pushSubscriptions: defineTable({
    quinielaId: v.id("quinielas"),
    audience: v.string(), // "participant" | "admin"
    participantId: v.optional(v.id("participants")),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
  })
    .index("by_participant", ["participantId"])
    .index("by_quiniela_audience", ["quinielaId", "audience"])
    .index("by_endpoint", ["endpoint"]),
```

- [ ] **Step 6: Escribir las pruebas que fallan de las mutations**

En `convex/notifications.test.ts`, añade un bloque:

```ts
describe("suscripciones push", () => {
  it("guarda (upsert por endpoint) y borra una suscripción del jugador", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4 });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.mutation(api.notifications.savePushSubscription, {
      personalToken: a.personalToken, endpoint: "https://push/x", p256dh: "k", auth: "s" });
    await t.mutation(api.notifications.savePushSubscription, {
      personalToken: a.personalToken, endpoint: "https://push/x", p256dh: "k2", auth: "s2" }); // upsert
    let subs = await t.run((ctx) => ctx.db.query("pushSubscriptions").collect());
    expect(subs).toHaveLength(1);
    expect(subs[0].p256dh).toBe("k2");
    await t.mutation(api.notifications.removePushSubscription, { endpoint: "https://push/x" });
    subs = await t.run((ctx) => ctx.db.query("pushSubscriptions").collect());
    expect(subs).toHaveLength(0);
  });

  it("savePushSubscription lanza con token inválido", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedFromSnapshot, {});
    await expect(t.mutation(api.notifications.savePushSubscription, {
      personalToken: "no", endpoint: "e", p256dh: "k", auth: "s" })).rejects.toThrow();
  });
});
```

- [ ] **Step 7: Correr para verificar que fallan**

Run: `npx vitest run convex/notifications.test.ts -t "suscripciones push"`
Expected: FAIL.

- [ ] **Step 8: Implementar las mutations + `getForPush` en `convex/notifications.ts`**

En `convex/notifications.ts`, cambia la línea de import de server (que tras la Task 4 dice
`import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";`) por
esta, añadiendo `internalQuery`:

```ts
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
```

Al final del archivo, añade:

```ts
async function recipientFromToken(ctx: MutationCtx, personalToken?: string, adminToken?: string) {
  if (personalToken) {
    const me = await ctx.db.query("participants")
      .withIndex("by_personalToken", (q) => q.eq("personalToken", personalToken)).first();
    if (!me) throw new Error("Jugador no encontrado");
    return { quinielaId: me.quinielaId, audience: "participant" as const, participantId: me._id };
  }
  if (adminToken) {
    const qn = await ctx.db.query("quinielas")
      .withIndex("by_adminToken", (q) => q.eq("adminToken", adminToken)).first();
    if (!qn) throw new Error("Quiniela no encontrada");
    return { quinielaId: qn._id, audience: "admin" as const, participantId: undefined };
  }
  throw new Error("Falta token");
}

export const savePushSubscription = mutation({
  args: {
    personalToken: v.optional(v.string()), adminToken: v.optional(v.string()),
    endpoint: v.string(), p256dh: v.string(), auth: v.string(),
  },
  handler: async (ctx, args) => {
    const r = await recipientFromToken(ctx, args.personalToken, args.adminToken);
    const fields = {
      quinielaId: r.quinielaId, audience: r.audience, participantId: r.participantId,
      endpoint: args.endpoint, p256dh: args.p256dh, auth: args.auth, createdAt: Date.now(),
    };
    const existing = await ctx.db.query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint)).first();
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("pushSubscriptions", fields);
    return { ok: true as const };
  },
});

export const removePushSubscription = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const existing = await ctx.db.query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint)).first();
    if (existing) await ctx.db.delete(existing._id);
    return { ok: true as const };
  },
});

export const pruneSubscriptions = internalMutation({
  args: { endpoints: v.array(v.string()) },
  handler: async (ctx, { endpoints }) => {
    for (const e of endpoints) {
      const s = await ctx.db.query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", e)).first();
      if (s) await ctx.db.delete(s._id);
    }
  },
});

/** Datos para enviar push de un aviso: copy, URL de deep-link y suscripciones del destinatario. */
export const getForPush = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const n = await ctx.db.get(notificationId);
    if (!n) return null;
    let url = `/q/${n.quinielaId}`;
    let subs;
    if (n.audience === "admin") {
      const qn = await ctx.db.get(n.quinielaId);
      if (qn) url = `/q/${n.quinielaId}/admin/${qn.adminToken}`;
      subs = await ctx.db.query("pushSubscriptions")
        .withIndex("by_quiniela_audience", (q) => q.eq("quinielaId", n.quinielaId).eq("audience", "admin")).collect();
    } else if (n.participantId) {
      const me = await ctx.db.get(n.participantId);
      if (me) url = `/q/${n.quinielaId}/me/${me.personalToken}`;
      subs = await ctx.db.query("pushSubscriptions")
        .withIndex("by_participant", (q) => q.eq("participantId", n.participantId!)).collect();
    } else {
      subs = [];
    }
    return {
      title: n.title, body: n.body, url,
      subscriptions: subs.map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })),
    };
  },
});
```

- [ ] **Step 9: Regenerar tipos y correr las pruebas**

Run: `npx convex dev --once && npx vitest run convex/notifications.test.ts convex/lib/push.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add convex/schema.ts convex/lib/push.ts convex/lib/push.test.ts convex/notifications.ts convex/notifications.test.ts convex/_generated
git commit -m "feat: suscripciones de Web Push (upsert/borrado/poda) + datos de envío"
```

---

## Task 10: PWA — manifest, iconos, service worker, registro

**Files:**
- Create: `public/manifest.webmanifest`, `public/sw.js`, `public/icon-192.png`, `public/icon-512.png`
- Modify: `index.html`, `src/main.tsx`

- [ ] **Step 1: Generar los iconos PNG**

Genera dos PNG cuadrados desde `public/favicon.svg` y guárdalos como `public/icon-192.png` (192×192) y `public/icon-512.png` (512×512). Opciones:
- Online: realfavicongenerator.net (subir el SVG, descargar los PNG).
- CLI: `npx sharp-cli -i public/favicon.svg -o public/icon-512.png resize 512 512` y `... resize 192 192 -o public/icon-192.png`.

Verifica: `ls -la public/icon-192.png public/icon-512.png` (ambos existen y pesan > 0).

- [ ] **Step 2: Crear el manifest**

Crea `public/manifest.webmanifest`:

```json
{
  "name": "Quiniela Mundial 2026",
  "short_name": "Quiniela",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 3: Crear el service worker**

Crea `public/sw.js`:

```js
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || "Quiniela Mundial 2026";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
```

- [ ] **Step 4: Enlazar manifest e iconos en `index.html`**

En `index.html`, dentro de `<head>`, después de la línea `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`, añade:

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#0a0a0a" />
    <link rel="apple-touch-icon" href="/icon-192.png" />
```

- [ ] **Step 5: Registrar el service worker**

En `src/main.tsx`, al final del archivo (después del `ReactDOM.createRoot(...).render(...)`), añade:

```tsx
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* push opcional: si falla el registro, la app sigue funcionando in-app */
    });
  });
}
```

- [ ] **Step 6: Verificar build**

Run: `npm run build`
Expected: build limpio; `dist/` contiene `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png` (archivos de `public/` se copian tal cual).

- [ ] **Step 7: Commit**

```bash
git add public/manifest.webmanifest public/sw.js public/icon-192.png public/icon-512.png index.html src/main.tsx
git commit -m "feat: PWA (manifest + iconos + service worker de push)"
```

---

## Task 11: Envío de push (`push.deliver`) + enganche en `insertNotification`

**Files:**
- Modify: `convex/push.ts` (reemplazar el spike por `deliver`)
- Modify: `convex/notifications.ts` (`insertNotification` agenda el envío)
- Config: variables de entorno VAPID

- [ ] **Step 1: Implementar `deliver` en `convex/push.ts`**

Reemplaza el contenido de `convex/push.ts` por:

```ts
"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { deadEndpoints } from "./lib/push";

declare const process: { env: Record<string, string | undefined> };

export const deliver = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }): Promise<void> => {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? "mailto:quiniela2026@example.com";
    if (!pub || !priv) return; // sin claves configuradas, no se envía push (in-app ya quedó)

    const data = await ctx.runQuery(internal.notifications.getForPush, { notificationId });
    if (!data || data.subscriptions.length === 0) return;

    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(subject, pub, priv);
    const payload = JSON.stringify({ title: data.title, body: data.body, url: data.url });

    const results: { endpoint: string; statusCode: number }[] = [];
    for (const s of data.subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (e) {
        const code = e && typeof e === "object" && "statusCode" in e
          ? Number((e as { statusCode: unknown }).statusCode) : 0;
        results.push({ endpoint: s.endpoint, statusCode: code });
      }
    }
    const dead = deadEndpoints(results);
    if (dead.length > 0) await ctx.runMutation(internal.notifications.pruneSubscriptions, { endpoints: dead });
  },
});
```

- [ ] **Step 2: Enganchar el envío en `insertNotification`**

En `convex/notifications.ts`, añade el import de `internal` (junto a los otros imports):

```ts
import { internal } from "./_generated/api";
```

En la función `insertNotification`, **reemplaza**:

```ts
  await ctx.db.insert("notifications", {
    quinielaId: intent.quinielaId as Id<"quinielas">,
    audience: intent.audience,
    participantId: intent.participantId ? (intent.participantId as Id<"participants">) : undefined,
    type: intent.type,
    title: intent.title,
    body: intent.body,
    matchId: intent.matchId ? (intent.matchId as Id<"matches">) : undefined,
    teamId: intent.teamId ? (intent.teamId as Id<"teams">) : undefined,
    createdAt: Date.now(),
    dedupeKey: intent.dedupeKey,
  });
}
```

por:

```ts
  const notificationId = await ctx.db.insert("notifications", {
    quinielaId: intent.quinielaId as Id<"quinielas">,
    audience: intent.audience,
    participantId: intent.participantId ? (intent.participantId as Id<"participants">) : undefined,
    type: intent.type,
    title: intent.title,
    body: intent.body,
    matchId: intent.matchId ? (intent.matchId as Id<"matches">) : undefined,
    teamId: intent.teamId ? (intent.teamId as Id<"teams">) : undefined,
    createdAt: Date.now(),
    dedupeKey: intent.dedupeKey,
  });
  // Envío de push en segundo plano (no bloquea la mutación). Si no hay claves VAPID
  // o suscripciones, la action no hace nada; el aviso in-app ya quedó persistido.
  await ctx.scheduler.runAfter(0, internal.push.deliver, { notificationId });
}
```

- [ ] **Step 3: Verificar que la suite sigue verde**

Run: `npx convex dev --once && npx vitest run convex/`
Expected: PASS. (convex-test ejecuta el `scheduler.runAfter`; `push.deliver` retorna temprano porque no hay claves VAPID en el entorno de test, así que no hace red.)

- [ ] **Step 4: Configurar las claves VAPID en dev**

Run (con las claves de la Task 8):
- `npx convex env set VAPID_PUBLIC_KEY <public>`
- `npx convex env set VAPID_PRIVATE_KEY <private>`
- `npx convex env set VAPID_SUBJECT "mailto:tu-correo@ejemplo.com"`

Y añade en `.env.local` (gitignored): `VITE_VAPID_PUBLIC_KEY=<public>`

- [ ] **Step 5: Commit**

```bash
git add convex/push.ts convex/notifications.ts convex/_generated
git commit -m "feat: envío de Web Push (action Node) enganchado a la inserción de avisos"
```

---

## Task 12: Frontend opt-in de push

**Files:**
- Create: `src/lib/usePushSubscription.ts`, `src/components/PushOptIn.tsx`
- Modify: `src/routes/Personal.tsx`, `src/routes/Admin.tsx`

- [ ] **Step 1: Crear el hook `usePushSubscription`**

Crea `src/lib/usePushSubscription.ts`:

```ts
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePushSubscription(args: { personalToken?: string; adminToken?: string }) {
  const save = useMutation(api.notifications.savePushSubscription);
  const remove = useMutation(api.notifications.removePushSubscription);
  const supported =
    typeof window !== "undefined" && "serviceWorker" in navigator &&
    "PushManager" in window && "Notification" in window && !!VAPID_PUBLIC;
  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => setEnabled(!!s))
      .catch(() => { /* ignore */ });
  }, [supported]);

  async function enable() {
    if (!supported) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!),
      });
      const json = sub.toJSON();
      await save({ ...args, endpoint: sub.endpoint, p256dh: json.keys!.p256dh, auth: json.keys!.auth });
      setEnabled(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await remove({ endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }

  return { supported, standalone, enabled, busy, enable, disable };
}
```

- [ ] **Step 2: Crear el componente `PushOptIn`**

Crea `src/components/PushOptIn.tsx`:

```tsx
import { usePushSubscription } from "@/lib/usePushSubscription";

/** Botón de opt-in de Web Push. En iPhone, si la app no está en modo standalone, explica
 *  el paso de "Agregar a pantalla de inicio" antes de poder activar. */
export function PushOptIn({ personalToken, adminToken }: { personalToken?: string; adminToken?: string }) {
  const { supported, standalone, enabled, busy, enable, disable } = usePushSubscription({ personalToken, adminToken });
  if (!supported) return null;

  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !standalone) {
    return (
      <p className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-[0.78rem] text-muted-foreground">
        📲 Para recibir avisos con la app cerrada, agrégala a tu pantalla de inicio:
        toca <span className="font-semibold">Compartir</span> → <span className="font-semibold">Agregar a inicio</span>.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void (enabled ? disable() : enable())}
      disabled={busy}
      className="mt-3 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-50"
    >
      {busy ? "…" : enabled ? "🔔 Avisos activados (tocar para desactivar)" : "🔔 Avisarme aunque cierre la app"}
    </button>
  );
}
```

- [ ] **Step 3: Montar `PushOptIn` en el panel personal**

En `src/routes/Personal.tsx`:

1. Añade el import:

```tsx
import { PushOptIn } from "@/components/PushOptIn";
```

2. Justo después del `</header>` (cierre del header), añade:

```tsx
      <PushOptIn personalToken={token!} />
```

- [ ] **Step 4: Montar `PushOptIn` en el panel admin**

En `src/routes/Admin.tsx`:

1. Añade el import:

```tsx
import { PushOptIn } from "@/components/PushOptIn";
```

2. Justo después del bloque `{/* Invite link card */}` (el `</div>` que cierra esa tarjeta) y antes de `{/* Notes editor */}`, añade:

```tsx
      <PushOptIn adminToken={token!} />
```

- [ ] **Step 5: Verificar build, lint y tests**

Run: `npm run build && npm run lint && npm test`
Expected: todo verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/usePushSubscription.ts src/components/PushOptIn.tsx src/routes/Personal.tsx src/routes/Admin.tsx
git commit -m "feat: opt-in de Web Push en panel personal y admin (con guía iOS)"
```

---

## Task 13: Validación E2E Fase 2 y despliegue

**Files:** ninguno.

- [ ] **Step 1: Probar el opt-in y la entrega (Android/escritorio)**

Con Chrome/Firefox (donde push funciona en pestaña normal):
1. `npx convex dev` + `npm run dev`; abrir un panel personal.
2. Tocar "🔔 Avisarme aunque cierre la app" → conceder permiso → confirmar en la consola/red que se llamó `savePushSubscription`.
3. Verificar en dev que existe la fila: `npx convex run --no-push notifications:listForParticipant '{"personalToken":"<token>"}'` (o inspeccionar `pushSubscriptions` en el dashboard).
4. Disparar un aviso (p. ej. unir a otra persona para `player_joined` del admin, o `detectFromSync` con un partido corregido) → debe llegar la notificación del sistema **con la pestaña en segundo plano**.
5. Tocar la notificación → abre el deep-link correcto (`/q/:id/me/:token` o `/admin/:token`).

- [ ] **Step 2: Probar el caso iOS**

En un iPhone (Safari): abrir la app, **Agregar a pantalla de inicio**, abrir desde el icono (standalone) → el botón de opt-in aparece (ya no el texto de instrucción) → activar y verificar la llegada de un push.

- [ ] **Step 3: Verificación final**

Run: `npm test && npm run build && npm run lint && npx tsc -p convex && npx tsc`
Expected: todo verde.

- [ ] **Step 4: Despliegue (solo cuando el usuario lo autorice)**

1. Backend: `npx convex deploy --yes`
2. Claves VAPID en prod:
   - `npx convex env set VAPID_PUBLIC_KEY <public> --prod`
   - `npx convex env set VAPID_PRIVATE_KEY <private> --prod`
   - `npx convex env set VAPID_SUBJECT "mailto:tu-correo@ejemplo.com" --prod`
3. Frontend (la pública se hornea en build): `railway variable set VITE_VAPID_PUBLIC_KEY=<public> --service quiniela2026`
4. `railway up --service quiniela2026`

(No desplegar sin confirmación explícita. `git fetch` + revisar `git log main` antes de integrar por sesiones concurrentes.)

---

## Notes for the implementer

- **Orden de fases:** la Fase 1 es independiente y desplegable sola (in-app, sin PWA ni permisos). La Fase 2 construye sobre la tabla `notifications` y el helper `insertNotification` de la Fase 1.
- **Codegen de Convex:** `convex/notifications.ts` y `convex/push.ts` son **archivos nuevos**; corre `npx convex dev --once` tras crearlos para que `_generated` (tipos) los reconozca antes de `tsc`/build. En las pruebas, `convex-test` los descubre vía `import.meta.glob`, así que los tests corren aunque `tsc` aún no los vea. `convex/_generated/` **se commitea**.
- **`MutationCtx` vs `QueryCtx`:** `detectFromSync` (mutation) reutiliza `resolveQuiniela(ctx, …)` (tipado `QueryCtx`). `MutationCtx` es asignable a `QueryCtx`, así que normalmente compila sin cambios; si no, amplía el parámetro a `QueryCtx | MutationCtx` en `convex/lib/perQuiniela.ts`.
- **`web-push` y edge-runtime:** impórtalo **dinámicamente** dentro del handler (`(await import("web-push")).default`) y mantén `"use node"` arriba. Así `convex-test` (edge-runtime) puede cargar el módulo por el glob sin arrastrar dependencias de Node, y la suite se queda verde.
- **Idempotencia:** la unicidad de un aviso la da `dedupeKey` + el índice `by_dedupe`; nunca insertes notificaciones por fuera de `insertNotification`.
- **`unreadCount`:** se calcula sobre los últimos 50 avisos (suficiente para esta escala). Si algún día importa el conteo exacto con cientos de no leídos, conviene un contador agregado.
- **Toasts en primera carga:** un destinatario sin corte previo (`localStorage`) no recibe toasts del historial; los verá en la campana. Es intencional para no spamear al abrir.
- **Privacidad:** las suscripciones push son endpoints anónimos del navegador; no hay correo ni teléfono en ninguna tabla. El deep-link reusa los tokens existentes (`personalToken`/`adminToken`).
