import type {
  FieldStat,
  GkStat,
  Player,
  Position,
  Stats,
  Subs,
} from "../types";
import { FAMILIES, WEIGHTS, type Family } from "./tables";
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
