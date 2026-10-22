import type { FieldStat, Position, Stats } from "../types";
import { familyOf } from "./ovr";
import { WEIGHTS } from "./tables";

/**
 * Changement de poste : le jeu ne se contente pas de changer la pondération,
 * il décale aussi les attributs selon le profil du poste (ex. LB → LM : tir
 * +8, défense −8 constaté sur un joueur).
 *
 * Décalages moyens par profil, en points de stat, relatifs au défenseur
 * central. Ajustés le 22/10/2026 sur 456 aperçus du jeu
 * (POST /api/store/position-cards/preview) : 415 exacts (91 %), tous à ±1.
 * Les erreurs restantes sont à moins de 0,15 d'un demi-point (signalées ⚠).
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
  CB: [0, 0, 0, 0, 0, 0],
  FB: [-1.38, 3.47, -1.38, 4.16, 4.53, -3.2],
  WB: [2.89, 1.53, 1.97, 2.0, 1.08, -3.1],
  CDM: [0.04, 8.58, 0.59, 4.16, 0.82, -3.27],
  CM: [-2.72, 13.07, -3.11, 6.01, 6.56, -8.18],
  CAM: [0.03, 14.24, 1.38, 1.15, -1.62, -7.06],
  WM: [-1.86, 10.89, -2.22, 7.34, -2.1, -2.94],
  W: [0.71, 10.05, 0, 4.19, -8.73, -1.45],
  ST: [-1.2, 13.43, -1.62, 4.61, -4.75, -7.97],
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
