import { describe, expect, it } from "vitest";
import { modelOvr, safeModelOvr, safeOvrAt } from "../../src/engine/ovr";
import { cardGain, cardTargets } from "../../src/engine/positionFit";
import { ovrLevers } from "../../src/engine/planner";
import { MAX_COACHES } from "../../src/engine/tables";
import type { Player, Subs } from "../../src/types";

const subs = (pac: [number, number], rest: Record<string, number>): Subs =>
  ({
    acceleration: pac[0],
    sprintSpeed: pac[1],
    ...Object.fromEntries(
      [
        "finishing",
        "shotPower",
        "longShots",
        "volleys",
        "penalties",
        "attackingPositioning",
      ].map((k) => [k, rest.sho]),
    ),
    ...Object.fromEntries(
      [
        "vision",
        "crossing",
        "fkAccuracy",
        "shortPassing",
        "longPassing",
        "curve",
      ].map((k) => [k, rest.pas]),
    ),
    ...Object.fromEntries(
      [
        "agility",
        "balance",
        "reactions",
        "ballControl",
        "dribblingSub",
        "composure",
      ].map((k) => [k, rest.dri]),
    ),
    ...Object.fromEntries(
      [
        "interceptions",
        "headingAccuracy",
        "defensiveAwareness",
        "standingTackle",
        "slidingTackle",
      ].map((k) => [k, rest.def]),
    ),
    ...Object.fromEntries(
      ["jumping", "stamina", "strength", "aggression"].map((k) => [
        k,
        rest.phy,
      ]),
    ),
  }) as Subs;
const player = (
  position: Player["position"],
  s: Subs,
  overall: number,
): Player => ({
  id: "t",
  name: "Test",
  position,
  age: 27,
  overall,
  potential: 99,
  traits: [],
  attributes: {
    pac: undefined,
    sho: undefined,
    pas: undefined,
    dri: undefined,
    def: undefined,
    phy: undefined,
    subs: s,
  },
});

describe("arrondis : calcul sûr et cas limites", () => {
  it("signale un OVR que l'autre arrondi ferait baisser", () => {
    // PAC = 84/83 (83,5) : stats arrondies → 79,51 en ailier (80), moyennes exactes → 79,37 (79).
    const p = player(
      "LM",
      subs([84, 83], { sho: 79, pas: 79, dri: 79, def: 72, phy: 70 }),
      79,
    );
    const w = safeOvrAt("W", p);
    expect(w).toMatchObject({ ovr: 80, safe: 79, edge: true });
    expect(w!.raw).toBeCloseTo(79.51, 2);
  });
  it("ne signale rien quand les deux arrondis sont d'accord et loin du demi-point", () => {
    const p = player(
      "LM",
      subs([95, 95], { sho: 70, pas: 70, dri: 90, def: 50, phy: 60 }),
      78,
    );
    expect(safeOvrAt("W", p)).toMatchObject({ ovr: 81, safe: 81, edge: false });
    expect(safeModelOvr(p)).toBe(modelOvr(p));
  });
});

describe("carte de poste : postes voisins seulement", () => {
  it("liste les voisins du manuel", () => {
    expect(cardTargets("CB")).toEqual(["CDM"]);
    expect(new Set(cardTargets("CM"))).toEqual(
      new Set(["CDM", "CAM", "LM", "RM"]),
    );
  });
  it("prend le meilleur voisin avec l'arrondi prudent", () => {
    const winger = subs([95, 95], {
      sho: 70,
      pas: 70,
      dri: 90,
      def: 50,
      phy: 60,
    });
    expect(cardGain(player("LM", winger, 78))).toMatchObject({
      gain: 3,
      best: "LW",
      edge: false,
    });
    // En CB, l'ailier est hors carte : seul CDM compte.
    expect(cardGain(player("CB", winger, 64)).best).toBe("CDM");
    // Cas limite : 80 « optimiste » mais 79 sûr → aucun gain depuis LM (79).
    const edge = player(
      "LM",
      subs([84, 83], { sho: 79, pas: 79, dri: 79, def: 72, phy: 70 }),
      79,
    );
    expect(cardGain(edge).gain).toBe(0);
  });
});

describe("leviers +1 OVR", () => {
  it("chaque levier atteint OVR affiché + 1 avec les deux arrondis", () => {
    const p = player(
      "CB",
      subs([78, 78], { sho: 78, pas: 78, dri: 78, def: 78, phy: 78 }),
      78,
    );
    p.age = 22;
    p.potential = 85;
    const levers = ovrLevers(p, { coaches: MAX_COACHES, center: 5 }).filter(
      (l) => l.progresses,
    );
    expect(levers.length).toBeGreaterThan(0);
    for (const l of levers) expect(l.sessions).toBeGreaterThan(0);
  });
});
