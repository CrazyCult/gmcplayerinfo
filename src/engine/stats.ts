import type { Stats, SubKey, Subs } from "../types";
import { FIELD_GROUPS, GK_GROUPS } from "./tables";

function summarize<K extends string>(
  groups: Record<K, readonly SubKey[]>,
  subs: Subs,
): Stats<K> {
  return Object.fromEntries(
    Object.entries<readonly SubKey[]>(groups).map(([stat, keys]) => {
      const values = keys.map((key) => subs[key]);
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
export const summaryStats = (subs: Subs) => summarize(FIELD_GROUPS, subs);
export const gkStats = (subs: Subs) => summarize(GK_GROUPS, subs);
