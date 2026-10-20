import {
  POSITIONS,
  type FitTier,
  type Player,
  type Position,
  type Subs,
} from "../types";
import { GOOD_PAIRS, OKAY_PAIRS } from "./tables";
import { familyOf, gkOvr, ovrForFamily, safeOvrAt } from "./ovr";
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
    // Valeur exacte avant arrondi + drapeau « limite » (voir safeOvrAt).
    const check =
      raw === undefined ? undefined : safeOvrAt(family, player, subs);
    return {
      position,
      raw,
      exact: check?.raw,
      safe: check?.safe,
      edge: check?.edge ?? false,
      ...fit,
      adjusted:
        raw === undefined ? undefined : Math.floor(raw * fit.coefficient),
      estimated: fit.tier !== "natural",
    };
  });
}

/**
 * Postes accessibles avec une carte de poste : les voisins du manuel (paires
 * « bon » et « acceptable »). Hypothèse documentée : le jeu indique qu'une
 * carte ne fait passer qu'à un poste voisin.
 */
export function cardTargets(position: Position): Position[] {
  return POSITIONS.filter((target) => {
    if (target === position) return false;
    const tier = getFit(position, target).tier;
    return tier === "good" || tier === "okay";
  });
}
/** Meilleur gain d'OVR « sûr » avec une carte de poste (0 si aucun). */
export function cardGain(player: Player, subs: Subs = player.attributes.subs) {
  const table = positionRatings(player, subs);
  const own = table.find((r) => r.position === player.position)?.raw;
  const targets = new Set(cardTargets(player.position));
  let best: (typeof table)[number] | undefined;
  for (const row of table)
    if (
      targets.has(row.position) &&
      row.safe !== undefined &&
      (best?.safe === undefined || row.safe > best.safe)
    )
      best = row;
  if (own === undefined || best?.safe === undefined || best.safe <= own)
    return { gain: 0, best: undefined, edge: false };
  return { gain: best.safe - own, best: best.position, edge: best.edge };
}
