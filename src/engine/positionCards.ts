import type { Position } from "../types";

/**
 * Cartes de poste du jeu (relevé de /api/store/position-cards, 21/10/2026).
 * Chaque carte change le poste d'une case ; les cartes s'enchaînent
 * (« glisser » : CB → LB → LM → LW…). GK et CF ne sont couverts par aucune carte.
 */
export const POSITION_CARDS = {
  defender_shift: {
    name: "Defender Shift",
    price: 20000,
    transitions: {
      LB: ["LWB", "LM", "CB"],
      LWB: ["LB"],
      CB: ["LB", "RB"],
      RB: ["RWB", "RM", "CB"],
      RWB: ["RB"],
      LM: ["LB"],
      RM: ["RB"],
    },
  },
  midfield_shift: {
    name: "Midfield Shift",
    price: 40000,
    transitions: {
      CDM: ["CM"],
      CM: ["CDM", "CAM", "LM", "RM"],
      CAM: ["CM"],
      LM: ["CM"],
      RM: ["CM"],
    },
  },
  forward_shift: {
    name: "Forward Shift",
    price: 75000,
    transitions: {
      CAM: ["ST"],
      ST: ["CAM", "LW", "RW"],
      LM: ["LW"],
      LW: ["LM", "ST"],
      RM: ["RW"],
      RW: ["RM", "ST"],
    },
  },
} as const satisfies Record<
  string,
  {
    name: string;
    price: number;
    transitions: Partial<Record<Position, readonly Position[]>>;
  }
>;
export type CardType = keyof typeof POSITION_CARDS;

export interface CardStep {
  from: Position;
  to: Position;
  card: CardType;
  price: number;
}
export interface CardRoute {
  to: Position;
  cost: number;
  cards: number;
  steps: CardStep[];
}

const EDGES = new Map<Position, CardStep[]>();
for (const [card, cfg] of Object.entries(POSITION_CARDS) as [
  CardType,
  (typeof POSITION_CARDS)[CardType],
][])
  for (const [from, targets] of Object.entries(cfg.transitions) as [
    Position,
    readonly Position[],
  ][])
    for (const to of targets) {
      const list = EDGES.get(from) ?? [];
      list.push({ from, to, card, price: cfg.price });
      EDGES.set(from, list);
    }

const cache = new Map<Position, Map<Position, CardRoute>>();
/**
 * Chemin le moins cher (puis le plus court) vers chaque poste atteignable.
 * Dijkstra sur le graphe des cartes ; le poste de départ n'est pas inclus.
 */
export function cardRoutes(from: Position): Map<Position, CardRoute> {
  const hit = cache.get(from);
  if (hit) return hit;
  const best = new Map<Position, CardRoute>([
    [from, { to: from, cost: 0, cards: 0, steps: [] }],
  ]);
  const done = new Set<Position>();
  for (;;) {
    let cur: CardRoute | undefined;
    for (const r of best.values())
      if (
        !done.has(r.to) &&
        (!cur ||
          r.cost < cur.cost ||
          (r.cost === cur.cost && r.cards < cur.cards))
      )
        cur = r;
    if (!cur) break;
    done.add(cur.to);
    for (const step of EDGES.get(cur.to) ?? []) {
      const cost = cur.cost + step.price,
        cards = cur.cards + 1,
        old = best.get(step.to);
      if (!old || cost < old.cost || (cost === old.cost && cards < old.cards))
        best.set(step.to, {
          to: step.to,
          cost,
          cards,
          steps: [...cur.steps, step],
        });
    }
  }
  best.delete(from);
  cache.set(from, best);
  return best;
}
export const cardRoute = (from: Position, to: Position) =>
  from === to ? undefined : cardRoutes(from).get(to);

/** « CB → LB → LM » */
export const routeLabel = (route: CardRoute) =>
  [route.steps[0]?.from, ...route.steps.map((s) => s.to)].join(" → ");
/** « 2 cartes · 40 000 GMC2 » (sans formatage de nombre ici). */
export const routeCards = (route: CardRoute) =>
  `${route.cards} carte${route.cards > 1 ? "s" : ""}`;
