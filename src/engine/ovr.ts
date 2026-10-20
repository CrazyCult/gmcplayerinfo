import type {
  FieldStat,
  GkStat,
  Player,
  Position,
  Stats,
  Subs,
} from "../types";
import {
  FAMILIES,
  FIELD_GROUPS,
  GK_GROUPS,
  WEIGHTS,
  type Family,
} from "./tables";
import { gkStats, summaryStats } from "./stats";

export const familyOf = (position: Position): Family => FAMILIES[position];
export function gkOvr(stats: Stats<GkStat>): number | undefined {
  const values = ["div", "han", "kic", "ref", "pos", "spe"].map(
    (key) => stats[key as GkStat],
  );
  if (values.some((value) => value === undefined || !Number.isFinite(value)))
    return undefined;
  return Math.floor(
    (2 * (values as number[]).reduce((sum, value) => sum + value, 0) + 6) / 12,
  );
}
export function ovrForFamily(
  family: Exclude<Family, "GK">,
  stats: Stats<FieldStat>,
): number | undefined {
  const values = ["pac", "sho", "pas", "dri", "def", "phy"].map(
    (key) => stats[key as FieldStat],
  );
  if (values.some((value) => value === undefined || !Number.isFinite(value)))
    return undefined;
  return Math.floor(
    ((values as number[]).reduce(
      (sum, value, index) => sum + value * WEIGHTS[family][index],
      0,
    ) +
      50) /
      100,
  );
}
export function modelOvr(
  player: Pick<Player, "position" | "attributes">,
  subs: Subs = player.attributes.subs,
): number | undefined {
  const family = familyOf(player.position);
  return family === "GK"
    ? gkOvr(gkStats(subs, player.attributes))
    : ovrForFamily(family, summaryStats(subs, player.attributes));
}

/**
 * Moyennes NON arrondies des sous-attributs (repli : stat affichée par le jeu
 * si le groupe est entièrement absent). Vérifié sur 615 annonces du marché
 * (20/10/2026) : la formule à stats arrondies est exacte à 97,9 %, et presque
 * tous les écarts tombent à ±0,05 d'un demi-point. Le jeu calcule donc
 * probablement avec plus de précision : on encadre les cas limites.
 */
function unroundedStats<K extends string>(
  groups: Record<K, readonly (keyof Subs)[]>,
  subs: Subs,
  fallback: Partial<Record<K, number | undefined>>,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const [stat, keys] of Object.entries<readonly (keyof Subs)[]>(groups)) {
    const values = keys.map((key) => subs[key]);
    const given = fallback[stat as K];
    if (values.every((v) => v === undefined) && typeof given === "number")
      out[stat as K] = given;
    else if (values.every((v) => typeof v === "number" && Number.isFinite(v)))
      out[stat as K] =
        (values as number[]).reduce((sum, v) => sum + v, 0) / keys.length;
  }
  return out;
}
const FIELD_KEYS = ["pac", "sho", "pas", "dri", "def", "phy"] as const;
const GK_KEYS = ["div", "han", "kic", "ref", "pos", "spe"] as const;
/** Valeur brute (avant arrondi final), stats arrondies ou non. */
export function rawOvrValue(
  family: Family,
  player: Pick<Player, "attributes">,
  subs: Subs = player.attributes.subs,
  unrounded = false,
): number | undefined {
  if (family === "GK") {
    const stats = unrounded
      ? unroundedStats(GK_GROUPS, subs, player.attributes)
      : gkStats(subs, player.attributes);
    const values = GK_KEYS.map((k) => stats[k]);
    if (values.some((v) => typeof v !== "number")) return undefined;
    return (values as number[]).reduce((s, v) => s + v, 0) / 6;
  }
  const stats = unrounded
    ? unroundedStats(FIELD_GROUPS, subs, player.attributes)
    : summaryStats(subs, player.attributes);
  const values = FIELD_KEYS.map((k) => stats[k]);
  if (values.some((v) => typeof v !== "number")) return undefined;
  return (
    (values as number[]).reduce(
      (sum, v, i) => sum + v * WEIGHTS[family][i],
      0,
    ) / 100
  );
}
/**
 * OVR « sûr » à une famille de poste : le plus bas des deux arrondis possibles,
 * et `edge` = le résultat est trop proche du demi-point (< 0,15) ou les deux
 * arrondis divergent → le jeu peut afficher un point de moins.
 */
export function safeOvrAt(
  family: Family,
  player: Pick<Player, "attributes">,
  subs: Subs = player.attributes.subs,
): { ovr: number; safe: number; raw: number; edge: boolean } | undefined {
  const raw = rawOvrValue(family, player, subs);
  const fine = rawOvrValue(family, player, subs, true);
  if (raw === undefined || fine === undefined) return undefined;
  const ovr = Math.floor(raw + 0.5),
    other = Math.floor(fine + 0.5),
    safe = Math.min(ovr, other);
  const distance = raw - (ovr - 0.5);
  return { ovr, safe, raw, edge: other !== ovr || distance < 0.15 };
}
export function safeModelOvr(
  player: Pick<Player, "position" | "attributes">,
  subs: Subs = player.attributes.subs,
): number | undefined {
  return safeOvrAt(familyOf(player.position), player, subs)?.safe;
}
