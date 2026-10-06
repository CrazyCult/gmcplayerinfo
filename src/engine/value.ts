// Valeur du jeu après progression : estimation tirée de 4 184 joueurs réels
// (régression du logarithme de la valeur sur l'OVR, l'âge et l'écart au
// potentiel, par tranche d'OVR). Un point d'OVR multiplie la valeur par :
//   < 65 : ×1,054 · 65-74 : ×1,153 · 75-84 : ×1,142 · ≥ 85 : ×1,113
// À OVR et âge égaux, la valeur varie d'environ ±30 % d'un joueur à l'autre :
// on part donc de la valeur actuelle du joueur et on n'applique que l'effet
// des points gagnés (son écart propre est conservé).
export function valueGainPerPoint(ovr: number): number {
  if (ovr < 65) return 1.054;
  if (ovr < 75) return 1.153;
  if (ovr < 85) return 1.142;
  return 1.113;
}

/** Valeur estimée quand l'OVR passe de `from` à `to` (arrondie à 10 000). */
export function projectValue(value: number, from: number, to: number): number {
  let factor = 1;
  for (let ovr = from; ovr < to; ovr++) factor *= valueGainPerPoint(ovr);
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
