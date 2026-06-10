// convex/participants.test.ts
// @vitest-environment edge-runtime
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { tournamentCodeOf } from "./lib/tournaments";

async function setup(n: number) {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));
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
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(owns.length).toBeGreaterThanOrEqual(4);
    expect(owns.length).toBeLessThanOrEqual(5);
    expect(new Set(owns.map((o) => o.teamId)).size).toBe(owns.length); // unique
  });

  it("never assigns the same team to two participants", async () => {
    const { t, q } = await setup(2); // 24 + 24
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "A" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "B" });
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(new Set(owns.map((o) => o.teamId)).size).toBe(owns.length);
  });

  it("rejects joining when all slots are full", async () => {
    const { t, q } = await setup(1);
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "A" });
    await expect(
      t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "B" }),
    ).rejects.toThrow();
  });

  it("rejects a whitespace-only name", async () => {
    const { t, q } = await setup(4);
    await expect(
      t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "   " }),
    ).rejects.toThrow();
  });

  it("does not assign teams on join when assignMode is on_reveal", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "F", prizeText: "$1", numParticipants: 2, assignMode: "on_reveal",
    });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const owns = await t.run((ctx) =>
      ctx.db.query("ownerships").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    expect(owns.length).toBe(0); // teams wait for the admin's manual reveal
  });

  it("joinQuiniela reparte solo equipos del torneo de la quiniela", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    // 4 equipos WC + 12 PL: el sorteo on_join debe ignorar por completo los de PL.
    for (const ext of ["w1", "w2", "w3", "w4"]) {
      await t.mutation(internal.matches.upsertTeam, {
        team: { externalId: ext, name: ext, code: ext, crest: "" }, tournamentCode: "WC", format: "eliminatorio",
      });
    }
    for (let i = 1; i <= 12; i++) {
      await t.mutation(internal.matches.upsertTeam, {
        team: { externalId: `p${i}`, name: `p${i}`, code: `p${i}`, crest: "" }, tournamentCode: "PL", format: "liga",
      });
    }
    // 4 equipos WC y 2 participantes → slots [2, 2]: los joins agotan el pool del torneo
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "Mini WC", prizeText: "$1", numParticipants: 2, gameMode: "clasica", tournamentCode: "WC",
    });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Beto" });
    await t.run(async (ctx) => {
      const teams = await ctx.db.query("teams").collect();
      const wcIds = new Set(teams.filter((tm) => tournamentCodeOf(tm) === "WC").map((tm) => tm._id as string));
      const owns = await ctx.db.query("ownerships")
        .withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect();
      expect(owns).toHaveLength(4);
      for (const o of owns) {
        const team = (await ctx.db.get(o.teamId))!;
        expect(tournamentCodeOf(team)).toBe("WC");
      }
      // La unión de equipos asignados es EXACTAMENTE el pool WC sembrado
      expect(new Set(owns.map((o) => o.teamId as string))).toEqual(wcIds);
    });
  });
});

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

describe("getPersonalPanel", () => {
  it("returns my teams with next opponent and owner", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Beto" });
    const panel = await t.query(api.participants.getPersonalPanel, { personalToken: a.personalToken });
    expect(panel.me.name).toBe("Ana");
    expect(panel.teams.length).toBeGreaterThan(0);
    expect(panel.me.status).toBe("alive");
  });

  it("ordena mis equipos alfabéticamente por nombre", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    // 2 participantes → ~24 equipos cada uno: el orden de asignación no es
    // alfabético por azar, así que el assert falla sin el ordenamiento.
    const q = await t.mutation(api.quinielas.createQuiniela, { name: "F", prizeText: "$1", numParticipants: 2 });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const panel = await t.query(api.participants.getPersonalPanel, { personalToken: a.personalToken });
    const names = panel.teams.map((x) => x.team.name);
    expect(names.length).toBeGreaterThan(1);
    expect(names).toEqual([...names].sort((x, y) => x.localeCompare(y)));
  });

  it("reports pending status before the reveal in on_reveal mode", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "F", prizeText: "$1", numParticipants: 2, assignMode: "on_reveal",
    });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const panel = await t.query(api.participants.getPersonalPanel, { personalToken: a.personalToken });
    expect(panel.me.status).toBe("pending");
    expect(panel.teams.length).toBe(0);
  });

  it("reflects the PAID pool in the per_person prize view", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await t.mutation(internal.seed.seedFromSnapshot, {});
    const q = await t.mutation(api.quinielas.createQuiniela, {
      name: "Rifa", prizeText: "", numParticipants: 20, prizeMode: "per_person", entryFee: 200,
    });
    const a = await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Beto" });
    // nadie ha pagado → bote 0
    let panel = await t.query(api.participants.getPersonalPanel, { personalToken: a.personalToken });
    expect(panel.prize.pool).toBe(0);
    expect(panel.prize.contributors).toBe(0);
    // confirmo el pago de Ana → bote 200
    const ps = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: ps[0]._id, method: "efectivo" });
    panel = await t.query(api.participants.getPersonalPanel, { personalToken: a.personalToken });
    expect(panel.prize.pool).toBe(200);
    expect(panel.prize.contributors).toBe(1);
  });
});

describe("updateParticipantPhoto", () => {
  it("updates the participant's photo and deletes the previous one", async () => {
    const { t, q } = await setup(4);
    const oldPhotoId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["old"], { type: "image/png" })));
    const a = await t.mutation(api.participants.joinQuiniela, {
      joinToken: q.joinToken, name: "Ana", photoId: oldPhotoId,
    });
    const newPhotoId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["new"], { type: "image/png" })));

    await t.mutation(api.participants.updateParticipantPhoto, {
      personalToken: a.personalToken, photoId: newPhotoId,
    });

    const p = await t.run((ctx) =>
      ctx.db.query("participants")
        .withIndex("by_personalToken", (x) => x.eq("personalToken", a.personalToken))
        .first());
    expect(p?.photoId).toBe(newPhotoId);
    const oldUrl = await t.run((ctx) => ctx.storage.getUrl(oldPhotoId));
    expect(oldUrl).toBeNull(); // la anterior se borró del storage
  });

  it("sets a photo for a participant that had none (no delete attempted)", async () => {
    const { t, q } = await setup(4);
    const a = await t.mutation(api.participants.joinQuiniela, {
      joinToken: q.joinToken, name: "Ana",
    });
    const photoId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["new"], { type: "image/png" })));

    await t.mutation(api.participants.updateParticipantPhoto, {
      personalToken: a.personalToken, photoId,
    });

    const p = await t.run((ctx) =>
      ctx.db.query("participants")
        .withIndex("by_personalToken", (x) => x.eq("personalToken", a.personalToken))
        .first());
    expect(p?.photoId).toBe(photoId);
    // la nueva foto sigue existiendo (no se borró nada)
    const url = await t.run((ctx) => ctx.storage.getUrl(photoId));
    expect(url).not.toBeNull();
  });

  it("rejects an invalid personalToken", async () => {
    const { t } = await setup(4);
    const photoId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["x"], { type: "image/png" })));
    await expect(
      t.mutation(api.participants.updateParticipantPhoto, {
        personalToken: "nope", photoId,
      }),
    ).rejects.toThrow();
  });
});

describe("setParticipantPayment", () => {
  async function joinOne() {
    const { t, q } = await setup(4);
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    const ps = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    return { t, q, id: ps[0]._id };
  }

  it("efectivo: paid=true y método efectivo", async () => {
    const { t, q, id } = await joinOne();
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "efectivo" });
    const p = await t.run((ctx) => ctx.db.get(id));
    expect(p?.paid).toBe(true);
    expect(p?.paymentMethod).toBe("efectivo");
  });

  it("transferencia: paid=true y método transferencia", async () => {
    const { t, q, id } = await joinOne();
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "transferencia" });
    const p = await t.run((ctx) => ctx.db.get(id));
    expect(p?.paid).toBe(true);
    expect(p?.paymentMethod).toBe("transferencia");
  });

  it("pending limpia paid y método", async () => {
    const { t, q, id } = await joinOne();
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "efectivo" });
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "pending" });
    const p = await t.run((ctx) => ctx.db.get(id));
    expect(p?.paid).toBeUndefined();
    expect(p?.paymentMethod).toBeUndefined();
  });

  it("cambia de método y mantiene paid", async () => {
    const { t, q, id } = await joinOne();
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "efectivo" });
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: id, method: "transferencia" });
    const p = await t.run((ctx) => ctx.db.get(id));
    expect(p?.paid).toBe(true);
    expect(p?.paymentMethod).toBe("transferencia");
  });

  it("rechaza un adminToken ajeno", async () => {
    const { t, id } = await joinOne();
    await expect(
      t.mutation(api.participants.setParticipantPayment, { adminToken: "ajeno", participantId: id, method: "efectivo" }),
    ).rejects.toThrow();
  });

  it("funciona tras cerrar la quiniela (pagos tardíos)", async () => {
    const { t, q } = await setup(4);
    await t.mutation(api.participants.joinQuiniela, { joinToken: q.joinToken, name: "Ana" });
    await t.mutation(api.quinielas.closeAndRedistribute, { adminToken: q.adminToken });
    const ps = await t.run((ctx) =>
      ctx.db.query("participants").withIndex("by_quiniela", (x) => x.eq("quinielaId", q.quinielaId)).collect());
    await t.mutation(api.participants.setParticipantPayment, { adminToken: q.adminToken, participantId: ps[0]._id, method: "efectivo" });
    const p = await t.run((ctx) => ctx.db.get(ps[0]._id));
    expect(p?.paid).toBe(true);
  });
});
