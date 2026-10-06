import { describe, expect, it } from "vitest";
import { planTraining, planVariants } from "../../src/engine/planner";
import {
  exerciseAccess,
  priceMultiplier,
  sessionGain,
  successRate,
  trainSession,
} from "../../src/engine/training";
import { MAX_COACHES } from "../../src/engine/tables";
import { pasero } from "../fixtures/pasero";

describe("Pasero : référence de la spécification", () => {
  it("atteint 103 en 20 séances pour 4 400 000 GMC2 et −160 de forme", () => {
    const plan = planTraining(pasero, { coaches: MAX_COACHES, center: 5 });
    expect(plan).toMatchObject({
      from: 96,
      to: 103,
      sessions: 20,
      cost: 4400000,
      expectedCost: 4400000,
      fitness: -160,
    });
    expect(plan.drills).toEqual({
      "Goalkeeper Acceleration": 10,
      "Goalkeeper Top Speed": 9,
      "Handling Drills": 1,
    });
    expect(plan.milestones.map((m) => m.ovr)).toEqual([
      97, 98, 99, 100, 101, 102, 103,
    ]);
    expect(plan.recharges).toBe(2);
  });
  it("ne gagne pas un point sur une seule séance de vitesse", () => {
    expect(
      trainSession(pasero, "gkSprintSpeed", { coaches: MAX_COACHES })?.session,
    ).toMatchObject({ before: 64, after: 68, ovrBefore: 96, ovrAfter: 96 });
  });
  it("retire une séance finale inutile avec le coach niveau 4", () => {
    const variants = planVariants(pasero, {
      coaches: { ...MAX_COACHES, gk: 4 },
    });
    expect(variants.current).toMatchObject({ to: 96, sessions: 0, cost: 0 });
    expect(variants.unlocked?.to).toBe(103);
  });
});
describe("séances et restrictions", () => {
  it.each([
    [17, 6],
    [21, 4],
    [27, 2],
    [32, 0],
  ])("âge %i : gain physique %i", (age, gain) =>
    expect(sessionGain(age, "strength")).toBe(gain),
  );
  it("après 31 ans : mental seul", () => {
    for (const key of ["vision", "composure", "aggression"] as const)
      expect(sessionGain(32, key)).toBe(2);
  });
  it.each([
    [80, 1],
    [81, 2],
    [85, 2],
    [86, 4],
    [90, 4],
    [91, 10],
    [95, 10],
    [96, 25],
  ])("OVR %i : prix ×%i", (ovr, multiplier) =>
    expect(priceMultiplier(ovr)).toBe(multiplier),
  );
  it("respecte le plafond sans modifier les données initiales", () => {
    const result = trainSession(pasero, "gkHandling", { coaches: MAX_COACHES });
    expect(result?.subs.gkHandling).toBe(103);
    expect(pasero.attributes.subs.gkHandling).toBe(102);
    expect(
      result &&
        trainSession(pasero, "gkHandling", {
          coaches: MAX_COACHES,
          subs: result.subs,
        }),
    ).toBeNull();
  });
  it("bloque les séances sous 35 de forme", () => {
    expect(
      trainSession(pasero, "gkHandling", { coaches: MAX_COACHES, fitness: 34 }),
    ).toBeNull();
    expect(
      trainSession(pasero, "gkHandling", { coaches: MAX_COACHES, fitness: 35 }),
    ).not.toBeNull();
  });
  it("CF : physio uniquement ; GK : pas de vitesse de champ", () => {
    expect(exerciseAccess("CF", "finishing", MAX_COACHES)).toEqual([]);
    expect(
      exerciseAccess("CF", "strength", MAX_COACHES).map((a) => a.coach),
    ).toEqual(["physio"]);
    for (const key of ["acceleration", "sprintSpeed", "agility"] as const)
      expect(exerciseAccess("GK", key, MAX_COACHES)).toEqual([]);
  });
  it("distingue coût réussi et coût attendu", () => {
    expect(successRate(4)).toBeCloseTo(0.96);
    expect(successRate(5)).toBe(1);
    const plan = planTraining(pasero, { coaches: MAX_COACHES, center: 4 });
    expect(plan.expectedCost).toBeCloseTo(plan.cost / 0.96);
  });
  it("signale un moteur incomplet au lieu de remplacer par zéro", () => {
    expect(
      planTraining({
        ...pasero,
        attributes: { ...pasero.attributes, subs: {} },
      }),
    ).toMatchObject({
      incomplete: true,
      from: undefined,
      to: undefined,
      sessions: 0,
    });
  });
});
