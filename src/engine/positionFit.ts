import {
  POSITIONS,
  type FitTier,
  type Player,
  type Position,
  type Subs,
} from "../types";
import { GOOD_PAIRS, OKAY_PAIRS } from "./tables";
import { familyOf, gkOvr, ovrForFamily } from "./ovr";
import { gkStats, summaryStats } from "./stats";

export function getFit(
  natural: Position,
  target: Position,
): { tier: FitTier; coefficient: number } {
  if (natural === target) return { tier: "natural", coefficient: 1 };
  if (
    GOOD_PAIRS.some((pair) => pair.includes(natural) && pair.includes(target))
  )
    return { tier: "good", coefficient: 0.95 };
  if (
    OKAY_PAIRS.some((pair) => pair.includes(natural) && pair.includes(target))
  )
    return { tier: "okay", coefficient: 0.9 };
  return { tier: "poor", coefficient: 0.85 };
}
export function positionRatings(
  player: Player,
  subs: Subs = player.attributes.subs,
) {
  const field = summaryStats(subs, player.attributes),
    keeper = gkStats(subs, player.attributes);
  return POSITIONS.map((position) => {
    const family = familyOf(position);
    const raw = family === "GK" ? gkOvr(keeper) : ovrForFamily(family, field);
    const fit = getFit(player.position, position);
    return {
      position,
      raw,
      ...fit,
      adjusted:
        raw === undefined ? undefined : Math.floor(raw * fit.coefficient),
      estimated: fit.tier !== "natural",
    };
  });
}
