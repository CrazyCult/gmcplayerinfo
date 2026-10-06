import type { Player } from "../types";

export function aggregateContracts(players: Player[]) {
  const groups = new Map<string, number[]>();
  for (const player of players) {
    if (
      player.wage === undefined ||
      !Number.isFinite(player.wage) ||
      player.wage <= 0
    )
      continue;
    const name = player.club?.league || "Tous";
    const values = groups.get(name) ?? [];
    values.push(player.wage);
    groups.set(name, values);
  }
  return [...groups].map(([group, values]) => {
    values.sort((a, b) => a - b);
    const trim =
      values.length >= 5 ? Math.max(1, Math.floor(values.length * 0.1)) : 0;
    const retained = trim ? values.slice(trim, -trim) : values;
    const total = retained.reduce((sum, wage) => sum + wage, 0);
    return {
      group,
      count: values.length,
      retained: retained.length,
      min: retained[0],
      mean: total / retained.length,
      max: retained.at(-1)!,
      total,
    };
  });
}
