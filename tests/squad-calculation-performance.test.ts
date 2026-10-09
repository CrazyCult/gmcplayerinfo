import { it, expect } from "vitest";
import { performance } from "node:perf_hooks";
import { FIELD_SUBS, type Player } from "@/types";
import { planTraining, ovrLevers } from "@/engine/planner";
import { MAX_COACHES } from "@/engine/tables";
it("profiles the calculations used by a 40-player squad", () => {
  const players: Player[] = Array.from({ length: 40 }, (_, i) => ({
    id: String(i),
    name: "Test",
    position: "CM",
    age: 20 + (i % 15),
    overall: 80,
    potential: 95,
    traits: [],
    attributes: {
      pac: 80,
      sho: 80,
      pas: 80,
      dri: 80,
      def: 80,
      phy: 80,
      subs: Object.fromEntries(FIELD_SUBS.map((k) => [k, 80])),
    },
  }));
  const start = performance.now();
  const plans = players.map((p) =>
    planTraining(p, { coaches: MAX_COACHES, center: 5 }),
  );
  const plansMs = performance.now() - start;
  const premiumStart = performance.now();
  players.forEach((p) => ovrLevers(p, { coaches: MAX_COACHES, center: 5 }));
  console.log(
    JSON.stringify({
      players: 40,
      plansMs: Math.round(plansMs),
      premiumLeversMs: Math.round(performance.now() - premiumStart),
    }),
  );
  expect(plans.every((p) => !p.incomplete)).toBe(true);
});
