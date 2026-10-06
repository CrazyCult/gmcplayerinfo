import { describe, expect, it } from "vitest";
import { FIELD_SUBS, POSITIONS, type Player } from "../../src/types";
import { gkStats, summaryStats } from "../../src/engine/stats";
import { familyOf, modelOvr, ovrForFamily } from "../../src/engine/ovr";
import { getFit, positionRatings } from "../../src/engine/positionFit";
import { WEIGHTS, MAX_COACHES } from "../../src/engine/tables";
import { trainSession } from "../../src/engine/training";
import { planTraining } from "../../src/engine/planner";
import { pasero } from "../fixtures/pasero";

const field: Player = {
  ...pasero,
  position: "ST",
  overall: 80,
  potential: 90,
  attributes: {
    ...summaryStats(Object.fromEntries(FIELD_SUBS.map((key) => [key, 80]))),
    subs: Object.fromEntries(FIELD_SUBS.map((key) => [key, 80])),
  },
};

describe("stats et OVR en entiers", () => {
  it("arrondit la moyenne de vitesse et ignore firstTouch", () => {
    expect(
      summaryStats({
        ...field.attributes.subs,
        acceleration: 80,
        sprintSpeed: 81,
        firstTouch: 150,
      }).pac,
    ).toBe(81);
    expect(modelOvr(field)).toBe(80);
  });
  it("ne calcule pas une stat avec un sous-attribut absent", () => {
    expect(summaryStats({ sprintSpeed: 90 }).pac).toBeUndefined();
    expect(gkStats({ gkDiving: 103 }).spe).toBeUndefined();
  });
  it("les huit familles totalisent 100 et respectent le demi-point", () => {
    for (const [family, weights] of Object.entries(WEIGHTS)) {
      expect(weights.reduce((sum, value) => sum + value, 0)).toBe(100);
      expect(
        ovrForFamily(
          family as keyof typeof WEIGHTS,
          summaryStats(field.attributes.subs),
        ),
      ).toBe(80);
    }
    expect(
      ovrForFamily("FB", {
        pac: 82,
        sho: 80,
        pas: 80,
        dri: 80,
        def: 80,
        phy: 80,
      }),
    ).toBe(81);
  });
  it("les attributs de champ ne changent jamais l’OVR gardien", () => {
    expect(modelOvr(pasero)).toBe(96);
    expect(
      modelOvr(pasero, {
        ...pasero.attributes.subs,
        ...Object.fromEntries(FIELD_SUBS.map((key) => [key, 150])),
      }),
    ).toBe(96);
  });
  it("aucun plafond arbitraire à 99", () => {
    expect(gkStats(pasero.attributes.subs).div).toBe(103);
  });
  it("recalcule le prix après un passage au palier 81", () => {
    const player = { ...field, potential: 94 };
    const first = trainSession(player, "finishing", { coaches: MAX_COACHES });
    expect(first?.session).toMatchObject({
      ovrBefore: 80,
      ovrAfter: 80,
      cost: 5000,
    });
    const second = trainSession(player, "finishing", {
      coaches: MAX_COACHES,
      subs: first!.subs,
    });
    expect(second?.session).toMatchObject({
      ovrBefore: 80,
      ovrAfter: 80,
      cost: 5000,
    });
    const third = trainSession(player, "finishing", {
      coaches: MAX_COACHES,
      subs: second!.subs,
    });
    expect(third?.session).toMatchObject({
      ovrBefore: 80,
      ovrAfter: 81,
      cost: 5000,
    });
    const fourth = trainSession(player, "shotPower", {
      coaches: MAX_COACHES,
      subs: third!.subs,
    });
    expect(fourth?.session).toMatchObject({ ovrBefore: 81, cost: 10000 });
  });
  it("le plan respecte le potentiel et finit par une séance qui augmente l’OVR", () => {
    const plan = planTraining(field, { coaches: MAX_COACHES });
    // Un ST ne peut pas entraîner defensiveAwareness ni slidingTackle.
    expect(plan.to).toBe(89);
    expect(Object.values(plan.subs).every((value) => value! <= 90)).toBe(true);
    expect(plan.sequence.at(-1)!.ovrAfter).toBeGreaterThan(
      plan.sequence.at(-1)!.ovrBefore,
    );
  });
});
describe("adéquation estimée", () => {
  it("est symétrique pour les 225 paires", () => {
    for (const a of POSITIONS)
      for (const b of POSITIONS) expect(getFit(a, b)).toEqual(getFit(b, a));
  });
  it("applique les quatre coefficients", () => {
    expect(getFit("CM", "CM").coefficient).toBe(1);
    expect(getFit("CM", "CAM").coefficient).toBe(0.95);
    expect(getFit("CB", "CDM").coefficient).toBe(0.9);
    expect(getFit("GK", "ST").coefficient).toBe(0.85);
  });
  it("au poste naturel, note brute = OVR calculé", () => {
    for (const position of POSITIONS.filter((p) => familyOf(p) !== "GK")) {
      const player = { ...field, position };
      const natural = positionRatings(player).find(
        (row) => row.position === position,
      )!;
      expect(natural.raw).toBe(modelOvr(player));
      expect(natural.adjusted).toBe(natural.raw);
    }
    expect(
      positionRatings(field).find((row) => row.position === "CAM")?.adjusted,
    ).toBe(76);
  });
});
