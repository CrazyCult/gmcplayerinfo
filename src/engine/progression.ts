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
