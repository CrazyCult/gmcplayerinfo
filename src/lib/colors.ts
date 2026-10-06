/**
 * Couleurs du jeu GameChase (relevées dans son code et son thème).
 * Rareté d'après l'OVR : galactico ≥ 100, legendary ≥ 90, epic ≥ 80,
 * rare ≥ 70, uncommon ≥ 60, common en dessous.
 */
export const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "galactico",
] as const;
export type RarityName = (typeof RARITIES)[number];
// Valeurs du jeu (thème sombre) définies en CSS (--rarity-*), avec des
// équivalents plus foncés en thème clair : voir globals.css.
export const RARITY_COLOR: Record<RarityName, string> = {
  common: "var(--rarity-common)",
  uncommon: "var(--rarity-uncommon)",
  rare: "var(--rarity-rare)",
  epic: "var(--rarity-epic)",
  legendary: "var(--rarity-legendary)",
  galactico: "var(--rarity-galactico)",
};
/** Couleur atténuée (fonds, contours) à partir d'une couleur ou d'une variable CSS. */
export const tint = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;
export const RARITY_LABEL: Record<RarityName, string> = {
  common: "Commun",
  uncommon: "Peu commun",
  rare: "Rare",
  epic: "Épique",
  legendary: "Légendaire",
  galactico: "Galactico",
};
export function rarityOf(overall: number): RarityName {
  return overall >= 100
    ? "galactico"
    : overall >= 90
      ? "legendary"
      : overall >= 80
        ? "epic"
        : overall >= 70
          ? "rare"
          : overall >= 60
            ? "uncommon"
            : "common";
}
/** Rareté affichée par le jeu si connue, sinon déduite de l'OVR. */
export const playerRarity = (p: {
  rarity?: string;
  overall: number;
}): RarityName =>
  (RARITIES as readonly string[]).includes(String(p.rarity).toLowerCase())
    ? (String(p.rarity).toLowerCase() as RarityName)
    : rarityOf(p.overall);

/** Barres d'attributs du jeu : part du potentiel (≥ 75 % vert, ≥ 55 % orange, sinon rouge). */
export const ATTRIBUTE_COLORS = {
  good: "#39d98a",
  warn: "#ffb020",
  bad: "#ff5470",
};
export function attributeShare(value: number | undefined, potential: number) {
  if (value === undefined || !Number.isFinite(value) || potential <= 0)
    return 0;
  return Math.min(100, (value / potential) * 100);
}
export function attributeColor(value: number | undefined, potential: number) {
  const pct = attributeShare(value, potential);
  return pct >= 75
    ? ATTRIBUTE_COLORS.good
    : pct >= 55
      ? ATTRIBUTE_COLORS.warn
      : ATTRIBUTE_COLORS.bad;
}
