import type { FieldStat, Position, Stats } from "../types";
import { familyOf } from "./ovr";
import { WEIGHTS } from "./tables";

/**
 * Changement de poste : le jeu ne se contente pas de changer la pondération,
 * il décale aussi les attributs selon le profil du poste (ex. LB → LM : tir
 * +8, défense −8 constaté sur un joueur).
 *
 * Le manuel le confirme (30/10/2026) : « his detailed attributes are reshaped
 * for the new role », et revenir au poste d'origine rend l'ancienne note.
 * Décalages moyens par profil, en points de stat, relatifs au défenseur
 * central, avec les poids du manuel. Ajustés sur 456 aperçus du jeu
 * (POST /api/store/position-cards/preview) : 428 exacts (94 %), tous à ±1.
 * Un déplacement A → B applique décalage(B) − décalage(A) ; les cartes
 * enchaînées donnent donc le même résultat que le déplacement direct.
 */
export const SHIFT_PROFILE: Record<Exclude<Position, "GK">, ShiftGroup> = {
  LB: "FB",
  RB: "FB",
  LWB: "WB",
  RWB: "WB",
  CB: "CB",
  CDM: "CDM",
  CM: "CM",
  CAM: "CAM",
  LM: "WM",
  RM: "WM",
  LW: "W",
  RW: "W",
  ST: "ST",
};
type ShiftGroup = "CB" | "FB" | "WB" | "CDM" | "CM" | "CAM" | "WM" | "W" | "ST";
/** Ordre : pac, sho, pas, dri, def, phy. */
export const SHIFT_OFFSETS: Record<ShiftGroup, readonly number[]> = {
  CB: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  FB: [-0.19, 2.19, -0.06, 3.08, 2.24, -1.32],
  WB: [-0.64, 4.55, -1.33, 5.65, 6.66, -8.05],
  CDM: [1.7, 7.14, 2.34, 2.44, -2.11, -0.86],
  CM: [0.92, 10.34, -0.05, 2.54, 1.79, -4.59],
  CAM: [5.99, 8.75, 7.77, -5.48, -13.44, 3.66],
  WM: [0.13, 10.43, -0.78, 5.13, -3.03, -3.06],
  W: [2.38, 7.98, 2.45, 2.26, -13.24, 2.65],
  ST: [1.13, 10.95, 1.0, 2.43, -9.5, -3.94],
};
const KEYS: readonly FieldStat[] = ["pac", "sho", "pas", "dri", "def", "phy"];
/** Distance au demi-point en dessous de laquelle l'estimation est incertaine. */
export const SHIFT_EDGE = 0.15;

/**
 * OVR estimé après changement de poste `from` → `to` (cartes enchaînées ou
 * non), à partir des 6 stats arrondies du joueur à son poste actuel.
 */
export function shiftedOvr(
  stats: Stats<FieldStat>,
  from: Position,
  to: Position,
): { ovr: number; raw: number; edge: boolean } | undefined {
  if (from === "GK" || to === "GK") return undefined;
  const values = KEYS.map((k) => stats[k]);
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v)))
    return undefined;
  const a = SHIFT_OFFSETS[SHIFT_PROFILE[from]],
    b = SHIFT_OFFSETS[SHIFT_PROFILE[to]];
  const family = familyOf(to) as Exclude<ReturnType<typeof familyOf>, "GK">;
  const raw =
    (values as number[]).reduce(
      (sum, v, i) =>
        sum + WEIGHTS[family][i] * (v + (from === to ? 0 : b[i] - a[i])),
      0,
    ) / 100;
  const ovr = Math.floor(raw + 0.5);
  return {
    ovr,
    raw,
    edge: from !== to && Math.abs(raw - Math.floor(raw) - 0.5) < SHIFT_EDGE,
  };
}
