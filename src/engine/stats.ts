import type {
  Attributes,
  FieldStat,
  GkStat,
  Stats,
  SubKey,
  Subs,
} from "../types";
import { FIELD_GROUPS, GK_GROUPS } from "./tables";

/**
 * Stat = moyenne arrondie de ses sous-attributs. `fallback` (stats affichées
 * par le jeu) ne sert que si TOUS les sous-attributs d'une stat sont absents :
 * fiche légère de la base du jeu. Un groupe partiel reste `undefined`.
 */
function summarize<K extends string>(
  groups: Record<K, readonly SubKey[]>,
  subs: Subs,
  fallback?: Partial<Record<K, number | undefined>>,
): Stats<K> {
  return Object.fromEntries(
    Object.entries<readonly SubKey[]>(groups).map(([stat, keys]) => {
      const values = keys.map((key) => subs[key]);
      const given = fallback?.[stat as K];
      if (
        values.every((value) => value === undefined) &&
        typeof given === "number" &&
        Number.isFinite(given)
      )
        return [stat, given];
      if (
        values.some((value) => value === undefined || !Number.isFinite(value))
      )
        return [stat, undefined];
      return [
        stat,
        Math.floor(
          (values as number[]).reduce((sum, value) => sum + value, 0) /
            keys.length +
            0.5,
        ),
      ];
    }),
  ) as Stats<K>;
}
export const summaryStats = (
  subs: Subs,
  fallback?: Partial<Pick<Attributes, FieldStat>>,
) => summarize(FIELD_GROUPS, subs, fallback);
export const gkStats = (
  subs: Subs,
  fallback?: Partial<Pick<Attributes, GkStat>>,
) => summarize(GK_GROUPS, subs, fallback);
/** Aucun sous-attribut connu : fiche légère (6 stats seulement). */
export const isLight = (attributes: Attributes) =>
  Object.values(attributes.subs).every((value) => value === undefined);
