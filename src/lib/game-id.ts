const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Identifiant du jeu (UUID) : joueur ou club. */
export const isGameId = (value: string) =>
  new RegExp(`^${UUID.source}$`, "i").test(value);

/**
 * Identifiant collé dans la recherche : seul, ou dans une adresse du jeu
 * (…/players/<id> : joueur ; …/club/<id> : club).
 */
export function parseGameId(
  input: string,
): { id: string; kind: "player" | "club" | "unknown" } | null {
  const match = UUID.exec(input.trim());
  if (!match) return null;
  const id = match[0].toLowerCase();
  const before = input.slice(0, match.index).toLowerCase();
  if (/\/club\/$/.test(before)) return { id, kind: "club" };
  if (/\/players?\/$/.test(before)) return { id, kind: "player" };
  return { id, kind: "unknown" };
}
