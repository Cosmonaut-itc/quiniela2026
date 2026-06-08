// convex/quinielas.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

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
    await t.mutation(api.participants.setParticipantPaid, { adminToken: q.adminToken, participantId: ps[0]._id, paid: true });
    await t.mutation(api.participants.setParticipantPaid, { adminToken: q.adminToken, participantId: ps[1]._id, paid: true });
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
