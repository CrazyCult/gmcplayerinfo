import { describe, expect, it } from "vitest";
import { nextBirthday, trainingBonus } from "@/lib/birthday";
import { playerSchema } from "@/schemas/player";

describe("prochain anniversaire (règle du jeu : +1 tous les 40 jours)", () => {
  const now = Date.parse("2026-11-09T19:00:00Z");
  it("compte les jours restants comme le jeu", () => {
    const n = nextBirthday("2026-10-20T07:15:40Z", 17, now)!;
    expect(n.days).toBe(40 - 20);
    expect(new Date(n.at).toISOString()).toBe("2026-11-29T07:15:00.000Z");
    expect(n.drop).toEqual([3, 2]); // 17 → 18 : ×3 → ×2
  });
  it("au moins 1 jour, même en retard", () => {
    expect(nextBirthday("2026-09-01T07:15:00Z", 20, now)!.days).toBe(1);
  });
  it("pas de baisse de bonus en dehors de 17, 24 et 30 ans", () => {
    expect(nextBirthday("2026-11-01T07:15:00Z", 20, now)!.drop).toBeUndefined();
    expect(nextBirthday("2026-11-01T07:15:00Z", 24, now)!.drop).toEqual([2, 1]);
    expect(nextBirthday("2026-11-01T07:15:00Z", 30, now)!.drop).toEqual([1, 0]);
    expect(trainingBonus(15)).toBe(3);
  });
  it("date inconnue : rien", () => {
    expect(nextBirthday(undefined, 17, now)).toBeNull();
    expect(nextBirthday("pas une date", 17, now)).toBeNull();
  });
  it("le schéma garde last_age_up_date", () => {
    const p = playerSchema.parse({
      id: "p1",
      name: "X",
      position: "ST",
      age: 17,
      overall: 70,
      potential: 90,
      attributes: { pac: 70, sho: 70, pas: 70, dri: 70, def: 40, phy: 60 },
      last_age_up_date: "2026-10-20T07:15:40Z",
    });
    expect(p.lastAgeUp).toBe("2026-10-20T07:15:40Z");
  });
});
