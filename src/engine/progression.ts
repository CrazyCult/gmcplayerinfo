import type { HistoryEntry } from "../types";

export function reconstructHistory(
  entries: HistoryEntry[],
  by: "date" | "age" = "date",
): HistoryEntry[] {
  const days = new Map<string, HistoryEntry>();
  for (const entry of entries) days.set(entry.day, { ...entry });
  const ordered = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  if (by === "date") return ordered;
  const ages = new Map<number, HistoryEntry>();
  for (const entry of ordered)
    if (entry.age !== undefined) ages.set(entry.age, entry);
  return [...ages.values()].sort((a, b) => a.age! - b.age!);
}

export interface OvrPoint {
  t: number;
  overall: number;
  potential?: number;
  age?: number;
}
const DATE_KEYS = [
  "date",
  "recorded_at",
  "recordedAt",
  "created_at",
  "createdAt",
  "changed_at",
  "at",
  "timestamp",
  "time",
  "day",
];
const OVR_KEYS = [
  "overall",
  "ovr",
  "new_overall",
  "newOverall",
  "value",
  "rating",
  "to",
];
const num = (v: unknown) =>
  typeof v === "number"
    ? v
    : typeof v === "string" && v.trim() !== ""
      ? Number(v)
      : NaN;
function toTime(v: unknown): number {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : NaN;
  }
  return NaN;
}
/**
 * Historique d'OVR renvoyé par le jeu (/api/players/{id}/overall-history).
 * Lecture tolérante : tableau direct ou sous une clé (history, points, data…),
 * points objets ({ date, overall, … }) ou paires [date, overall].
 */
export function parseOverallHistory(raw: unknown): OvrPoint[] {
  const box = raw as Record<string, unknown> | null;
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : box && typeof box === "object"
      ? ((["history", "points", "data", "items", "entries", "overallHistory"]
          .map((k) => box[k])
          .find(Array.isArray) as unknown[] | undefined) ?? [])
      : [];
  const points: OvrPoint[] = [];
  for (const entry of list) {
    let t = NaN,
      overall = NaN,
      potential: number | undefined,
      age: number | undefined;
    if (Array.isArray(entry)) {
      t = toTime(entry[0]);
      overall = num(entry[1]);
    } else if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      t = toTime(
        DATE_KEYS.map((k) => e[k]).find((v) => v !== undefined && v !== null),
      );
      overall = num(
        OVR_KEYS.map((k) => e[k]).find((v) => v !== undefined && v !== null),
      );
      const p = num(e.potential ?? e.pot);
      const a = num(e.age);
      if (Number.isFinite(p)) potential = p;
      if (Number.isFinite(a)) age = a;
    }
    if (
      Number.isFinite(t) &&
      Number.isFinite(overall) &&
      overall > 0 &&
      overall < 300
    )
      points.push({ t, overall: Math.round(overall), potential, age });
  }
  points.sort((a, b) => a.t - b.t);
  // Un point par jour (le dernier) pour une courbe lisible.
  const byDay = new Map<string, OvrPoint>();
  for (const p of points)
    byDay.set(new Date(p.t).toISOString().slice(0, 10), p);
  return [...byDay.values()];
}
