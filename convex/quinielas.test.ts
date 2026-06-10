// convex/quinielas.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { tournamentCodeOf } from "./lib/tournaments";

async function seeded() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
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
    const qn = await t.run((ctx) => ctx.db.get(res.quinielaId));
    expect(qn!.slotSizes.reduce((a: number, b: number) => a + b, 0)).toBe(48);
    expect(qn!.status).toBe("open");
  });

  it("stores the chosen assignMode and defaults to on_join", async () => {
    const t = await seeded();
    const def = await t.mutation(api.quinielas.createQuiniela, { name: "D", prizeText: "$1", numParticipants: 4 });
    const rev = await t.mutation(api.quinielas.createQuiniela, { name: "R", prizeText: "$1", numParticipants: 4, assignMode: "on_reveal" });
    const qd = await t.run((ctx) => ctx.db.get(def.quinielaId));
    const qr = await t.run((ctx) => ctx.db.get(rev.quinielaId));
    expect(qd!.assignMode).toBe("on_join");
    expect(qr!.assignMode).toBe("on_reveal");
  });

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
});

describe("closeAndRedistribute", () => {
  it("assigns all 48 teams when some slots were never filled", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 10 });
    // only 3 of 10 join
    for (const name of ["A", "B", "C"]) {
      await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name });
    }
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(owns.length).toBe(48); // every team owned
    expect(new Set(owns.map((o) => o.teamId)).size).toBe(48);
    const qn = await t.run((ctx) => ctx.db.get(q.quinielaId));
    expect(qn!.status).toBe("locked");
  });

  it("reveals all 48 teams balanced when the admin closes an on_reveal quiniela", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2, assignMode: "on_reveal" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "A" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "B" });
    // nobody owns a team before the reveal
    let owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(owns.length).toBe(0);
    // admin clicks "repartir" → all teams distributed and quiniela locked
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(owns.length).toBe(48);
    expect(new Set(owns.map((o) => o.teamId)).size).toBe(48);
    const counts = new Map<string, number>();
    for (const o of owns) counts.set(o.participantId, (counts.get(o.participantId) ?? 0) + 1);
    expect([...counts.values()].sort((a, b) => a - b)).toEqual([24, 24]); // balanced
    const qn = await t.run((ctx) => ctx.db.get(q.quinielaId));
    expect(qn!.status).toBe("locked");
  });
});

describe("autoCloseDue", () => {
  it("locks an on_join quiniela once the first match has started", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "A" });
    const first = await t.run((ctx) => ctx.db.query("matches").withIndex("by_kickoff").first());
    await t.run((ctx) => ctx.db.patch(first!._id, { kickoffAt: 1 })); // force kickoff into the past
    await t.mutation(internal.quinielas.autoCloseDue, {});
    const qn = await t.run((ctx) => ctx.db.get(q.quinielaId));
    expect(qn!.status).toBe("locked");
  });

  it("never auto-distributes an on_reveal quiniela (admin must reveal manually)", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2, assignMode: "on_reveal" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "A" });
    const first = await t.run((ctx) => ctx.db.query("matches").withIndex("by_kickoff").first());
    await t.run((ctx) => ctx.db.patch(first!._id, { kickoffAt: 1 }));
    await t.mutation(internal.quinielas.autoCloseDue, {});
    const qn = await t.run((ctx) => ctx.db.get(q.quinielaId));
    expect(qn!.status).toBe("open"); // stays open — no automatic reveal
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(owns.length).toBe(0);
  });
});

describe("getOverview", () => {
  it("ranks players by alive then alive-count and reports free slots", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    expect(ov.quiniela.name).toBe("F");
    expect(ov.players).toHaveLength(1);
    expect(ov.players[0].status).toBe("alive");
    expect(ov.freeSlots).toBe(3);
  });

  it("marks players pending before the reveal in on_reveal mode", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 4, assignMode: "on_reveal" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    expect(ov.quiniela.assignMode).toBe("on_reveal");
    expect(ov.players[0].status).toBe("pending");
  });

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
});

describe("getAdmin", () => {
  it("returns participants with team counts and the match list", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const admin = await t.query(api.quinielas.getAdmin, { adminToken: q.adminToken });
    expect(admin.participants).toHaveLength(1);
    expect(admin.participants[0].teamCount).toBeGreaterThan(0);
    expect(admin.matches.length).toBe(104);
    expect(admin.quiniela.joinToken).toBe(q.joinToken);
  });

  it("exposes assignMode to the admin", async () => {
    const t = await seeded();
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2, assignMode: "on_reveal" });
    const admin = await t.query(api.quinielas.getAdmin, { adminToken: q.adminToken });
    expect(admin.quiniela.assignMode).toBe("on_reveal");
  });

  it("exposes participant id and paid flag (default false)", async () => {
    const t = await seeded();
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const admin = await t.query(api.quinielas.getAdmin, { adminToken: q.adminToken });
    expect(admin.participants[0].id).toBeDefined();
    expect(admin.participants[0].paid).toBe(false);
  });

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
});

describe("getOverview prize", () => {
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
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: ps[0]._id, method: "efectivo" });
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: ps[1]._id, method: "efectivo" });
    ov = await t.query(api.quinielas.getOverview, { joinToken: q.joinToken });
    expect(ov.quiniela.prize.pool).toBe(400);
    expect(ov.quiniela.prize.contributors).toBe(2);
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

describe("multi-torneo", () => {
  it("createQuiniela clásica rechaza torneos de liga", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.matches.upsertTeam, {
      team: { externalId: "57", name: "Arsenal", code: "ARS", crest: "" }, tournamentCode: "PL", format: "liga",
    });
    await expect(
      t.mutation(api.quinielas.createQuiniela, {
        name: "Liga clásica", prizeText: "x", numParticipants: 4,
        gameMode: "clasica", tournamentCode: "PL",
      }),
    ).rejects.toThrow(/no admite Clásica/);
  });

  it("createQuiniela rechaza torneos sin datos", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await expect(
      t.mutation(api.quinielas.createQuiniela, {
        name: "Sin datos", prizeText: "x", numParticipants: 0,
        gameMode: "progol", tournamentCode: "SA",
      }),
    ).rejects.toThrow(/sin datos/);
  });

  it("clásica calcula slots con los equipos DEL torneo (no 48 fijos)", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
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
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    // 1 equipo PL (liga) + 1 equipo WC (eliminatorio): la resolución PL solo debe ver Arsenal
    await t.mutation(internal.matches.upsertTeam, {
      team: { externalId: "57", name: "Arsenal", code: "ARS", crest: "" }, tournamentCode: "PL", format: "liga",
    });
    await t.mutation(internal.matches.upsertTeam, {
      team: { externalId: "100", name: "México", code: "MEX", crest: "" }, tournamentCode: "WC", format: "eliminatorio",
    });
    const res = await t.mutation(api.quinielas.createQuiniela, {
      name: "Premier", prizeText: "x", numParticipants: 0, gameMode: "progol", tournamentCode: "PL",
    });
    await t.run(async (ctx) => {
      const qn = (await ctx.db.query("quinielas").collect()).find((q) => q.adminToken === res.adminToken)!;
      const { resolveQuiniela } = await import("./lib/perQuiniela");
      const resolved = await resolveQuiniela(ctx, qn._id);
      expect(resolved.teams).toHaveLength(1);
      expect(resolved.teams[0].name).toBe("Arsenal");
      // rama liga: nadie se elimina, no hay campeón de bracket
      expect(resolved.format).toBe("liga");
      expect(resolved.tournamentCode).toBe("PL");
      expect(resolved.states.get(resolved.teams[0]._id as string)).toMatchObject({
        alive: true, currentStage: "league",
      });
      expect(resolved.championTeamId).toBeNull();
    });
  });

  it("el reparto de Clásica al cerrar solo asigna equipos del torneo de la quiniela", async () => {
    const t = await seeded(); // 48 equipos del Mundial (filas legacy sin tournamentCode)
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 10 });
    // solo 2 de 10 se inscriben → el cierre reparte los equipos sobrantes
    for (const name of ["A", "B"]) {
      await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name });
    }
    // Arsenal (PL) se inserta DESPUÉS de los joins para que joinQuiniela no lo incluya en su sorteo
    await t.mutation(internal.matches.upsertTeam, {
      team: { externalId: "57", name: "Arsenal", code: "ARS", crest: "" }, tournamentCode: "PL", format: "liga",
    });
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    await t.run(async (ctx) => {
      const owns = await ctx.db.query("ownerships")
        .withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect();
      expect(owns).toHaveLength(48); // los 48 del Mundial; Arsenal (PL) queda fuera
      for (const o of owns) {
        const team = (await ctx.db.get(o.teamId))!;
        expect(tournamentCodeOf(team)).toBe("WC");
      }
    });
  });

  it("el auto-cierre usa el primer kickoff del torneo de cada quiniela", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.matches.upsertTeam, {
      team: { externalId: "57", name: "Arsenal", code: "ARS", crest: "" }, tournamentCode: "PL", format: "liga",
    });
    await t.mutation(internal.matches.upsertTeam, {
      team: { externalId: "100", name: "México", code: "MEX", crest: "" }, tournamentCode: "WC", format: "eliminatorio",
    });
    // PL ya arrancó; el Mundial arranca mañana
    await t.run(async (ctx) => {
      await ctx.db.insert("matches", {
        stage: "league", kickoffAt: Date.now() - 60_000, status: "scheduled", externalId: "pl-1", tournamentCode: "PL",
      });
      await ctx.db.insert("matches", {
        stage: "group", kickoffAt: Date.now() + 86_400_000, status: "scheduled", externalId: "wc-1", tournamentCode: "WC",
      });
    });
    const pl = await t.mutation(api.quinielas.createQuiniela, {
      name: "Premier", prizeText: "x", numParticipants: 0, gameMode: "progol", tournamentCode: "PL",
    });
    const wc = await t.mutation(api.quinielas.createQuiniela, {
      name: "Mundial", prizeText: "x", numParticipants: 0, gameMode: "progol", tournamentCode: "WC",
    });
    await t.mutation(internal.quinielas.autoCloseDue, {});
    const qpl = await t.run((ctx) => ctx.db.get(pl.quinielaId));
    const qwc = await t.run((ctx) => ctx.db.get(wc.quinielaId));
    expect(qpl!.status).toBe("locked"); // su torneo ya arrancó
    expect(qwc!.status).toBe("open");   // el suyo aún no
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
