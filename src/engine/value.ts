// Valeur du jeu (relevé du 23/10/2026, 493 annonces ; les ventes se font au
// prix de cette valeur : rapport vente / valeur médian 1,00 sur 100 transferts).
// Le jeu suit une formule : base selon l'OVR × âge × potentiel × traits,
// arrondie à 10 000. Elle retrouve la valeur à 1,2 % près en médiane
// (85 % des joueurs à 5 % près, OVR 69-99). Le poste ne compte pas.
//   âge : ≤ 21 ans ×1 · 22-24 ×0,80 · 25-29 ×0,67 · 30 ×0,57 · 31+ ×0,50
//   potentiel : ×1,0067 par point d'écart POT − OVR
//   traits : S ×1,20 · A ×1,10 · B et autres ×1,058 · Inconsistent ×0,926
export const VALUE_AGE: readonly [maxAge: number, factor: number][] = [
  [21, 1],
  [24, 0.8],
  [29, 0.67],
  [30, 0.57],
  [Infinity, 0.5],
];
export const VALUE_POT_GAP = 1.0067;
/** Base de valeur par OVR (joueur ≤ 21 ans, sans trait, POT = OVR). */
const BASE_STEP: Record<number, number> = {
  69: 1.178,
  70: 1.164,
  71: 1.164,
  72: 1.165,
  73: 1.158,
  74: 1.151,
  75: 1.153,
  76: 1.146,
  77: 1.144,
  78: 1.143,
  79: 1.136,
  80: 1.135,
  81: 1.13,
  82: 1.127,
  83: 1.124,
  84: 1.12,
  85: 1.116,
  86: 1.114,
  87: 1.11,
  88: 1.107,
  89: 1.103,
  90: 1.101,
  91: 1.097,
  92: 1.094,
  93: 1.091,
  94: 1.087,
  95: 1.084,
  96: 1.081,
  97: 1.077,
  98: 1.074,
};
/**
 * Multiplication de la base quand l'OVR passe de `ovr` à `ovr + 1`. Hors de
 * 69-98 (peu de données), repli sur la régression des 4 184 joueurs.
 */
export function valueGainPerPoint(ovr: number): number {
  if (BASE_STEP[ovr]) return BASE_STEP[ovr];
  if (ovr < 65) return 1.054;
  if (ovr < 69) return 1.153;
  return 1.113;
}

/**
 * Valeur estimée quand l'OVR passe de `from` à `to` (arrondie à 10 000). On
 * part de la valeur actuelle du joueur : âge et traits y sont déjà comptés ;
 * l'écart au potentiel diminue d'un point par point d'OVR gagné.
 */
export function projectValue(value: number, from: number, to: number): number {
  let factor = 1;
  for (let ovr = from; ovr < to; ovr++)
    factor *= valueGainPerPoint(ovr) / VALUE_POT_GAP;
  return Math.round((value * factor) / 10000) * 10000;
}

export interface ResaleStep {
  ovr: number;
  sessions: number;
  cost: number;
  value: number;
  /** Valeur gagnée moins le coût de l'entraînement. */
  net: number;
}

/** Étapes de revente à partir des paliers d'OVR d'un plan d'entraînement. */
export function resaleSteps(
  value: number,
  from: number,
  milestones: { ovr: number; sessions: number; cost: number }[],
): ResaleStep[] {
  return milestones.map((m) => {
    const projected = projectValue(value, from, m.ovr);
    return { ...m, value: projected, net: projected - value - m.cost };
  });
}
