import { describe, expect, it } from "vitest";
import { projectValue, resaleSteps } from "../../src/engine/value";

describe("valeur après progression", () => {
  it("applique le gain par point de la tranche d’OVR", () => {
    expect(projectValue(1_000_000, 85, 85)).toBe(1_000_000);
    expect(projectValue(1_000_000, 85, 86)).toBe(1_110_000);
    expect(projectValue(1_000_000, 84, 86)).toBe(1_270_000);
  });
  it("calcule la plus-value nette de chaque palier", () => {
    const steps = resaleSteps(4_000_000, 96, [
      { ovr: 97, sessions: 2, cost: 50_000 },
      { ovr: 100, sessions: 6, cost: 150_000 },
    ]);
    expect(steps[0]).toMatchObject({ value: 4_450_000, net: 400_000 });
    expect(steps[1].value).toBe(6_140_000);
    expect(steps[1].net).toBe(6_140_000 - 4_000_000 - 150_000);
  });
});
