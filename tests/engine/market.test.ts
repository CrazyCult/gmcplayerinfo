import { describe, expect, it } from "vitest";
import { estimateFromAsking } from "../../src/engine/market";
import { summaryStats, gkStats, isLight } from "../../src/engine/stats";
import { modelOvr } from "../../src/engine/ovr";
import { positionRatings } from "../../src/engine/positionFit";
import { playerSchema } from "../../src/schemas/player";

const ask = (price: number, kind: "transfer" | "loan" = "transfer") => ({
  kind,
  price,
});

describe("estimation sur les prix demandés", () => {
  it("rien sans annonce de ce type", () => {
    expect(estimateFromAsking([])).toBeNull();
    expect(estimateFromAsking([ask(1000, "loan")])).toBeNull();
  });
  it("médiane et fourchette interquartile, aberrations écartées", () => {
    const rows = [100, 110, 120, 130, 140, 150, 160, 170, 180, 5000].map((p) =>
      ask(p),
    );
    const estimate = estimateFromAsking(rows)!;
    expect(estimate.n).toBe(9);
    expect(estimate.median).toBe(140);
    expect(estimate.low).toBe(120);
    expect(estimate.high).toBe(160);
    expect(estimate.confidence).toBe("indicative");
  });
  it("peu d’annonces : fourchette min–max, confiance faible", () => {
    expect(estimateFromAsking([ask(200), ask(100)])).toEqual({
      n: 2,
      median: 150,
      low: 100,
      high: 200,
      confidence: "faible",
    });
  });
});

describe("fiche légère de la base du jeu (6 stats, aucun sous-attribut)", () => {
  // Exemples réels relevés dans la base du jeu (OVR affiché par le jeu).
  const light = (
    position: string,
    overall: number,
    attributes: Record<string, number>,
  ) =>
    playerSchema.parse({
      id: "x",
      name: "X",
      position,
      age: 25,
      overall,
      potential: overall + 3,
      attributes,
    });
  it("OVR exact depuis les stats du jeu", () => {
    const collins = light("LW", 93, {
      pac: 99,
      sho: 90,
      pas: 87,
      dri: 93,
      def: 80,
      phy: 92,
    });
    expect(isLight(collins.attributes)).toBe(true);
    expect(modelOvr(collins)).toBe(93);
    expect(
      modelOvr(
        light("ST", 117, {
          pac: 119,
          sho: 120,
          pas: 109,
          dri: 120,
          def: 90,
          phy: 110,
        }),
      ),
    ).toBe(117);
    expect(
      modelOvr(
        light("GK", 92, {
          div: 99,
          ref: 94,
          han: 99,
          spe: 77,
          kic: 89,
          pos: 96,
        }),
      ),
    ).toBe(92);
    expect(positionRatings(collins).find((r) => r.position === "LW")?.raw).toBe(
      93,
    );
  });
  it("un groupe partiellement connu reste incomplet (jamais complété en silence)", () => {
    expect(summaryStats({ acceleration: 80 }, { pac: 90 }).pac).toBeUndefined();
    expect(summaryStats({}, { pac: 90 }).pac).toBe(90);
    expect(gkStats({}, { div: 70 }).div).toBe(70);
  });
});
