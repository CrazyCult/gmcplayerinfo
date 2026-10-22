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
import { cardRoutes, type CardRoute } from "./positionCards";
import { shiftedOvr } from "./positionShift";

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
    // Carte de poste : OVR estimé après le décalage d'attributs du jeu.
    const card =
      position === player.position
        ? raw === undefined
          ? undefined
          : { ovr: raw, raw: check?.raw ?? raw, edge: check?.edge ?? false }
        : shiftedOvr(field, player.position, position);
    return {
      position,
      raw,
      exact: check?.raw,
      safe: check?.safe,
      edge: check?.edge ?? false,
      card,
      ...fit,
      adjusted:
        raw === undefined ? undefined : Math.floor(raw * fit.coefficient),
      estimated: fit.tier !== "natural",
    };
  });
}

/** Postes atteignables avec une ou plusieurs cartes de poste (voir positionCards). */
export function cardTargets(position: Position): Position[] {
  return [...cardRoutes(position).keys()];
}
/**
 * Meilleur gain d'OVR en changeant de poste (estimation avec le décalage
 * d'attributs du jeu), cartes enchaînées comprises. À OVR égal, le chemin le
 * moins cher l'emporte. 0 si aucun gain.
 */
export function cardGain(player: Player, subs: Subs = player.attributes.subs) {
  const table = positionRatings(player, subs);
  const own = table.find((r) => r.position === player.position)?.raw;
  const routes = cardRoutes(player.position);
  let best: (typeof table)[number] | undefined, route: CardRoute | undefined;
  for (const row of table) {
    const r = routes.get(row.position);
    if (!r || !row.card) continue;
    if (
      !best?.card ||
      row.card.ovr > best.card.ovr ||
      (row.card.ovr === best.card.ovr && route && r.cost < route.cost)
    ) {
      best = row;
      route = r;
    }
  }
  if (own === undefined || !best?.card || best.card.ovr <= own || !route)
    return { gain: 0, best: undefined, edge: false, route: undefined };
  return {
    gain: best.card.ovr - own,
    best: best.position,
    edge: best.card.edge,
    route,
  };
}
