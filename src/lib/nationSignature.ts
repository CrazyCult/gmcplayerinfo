/**
 * « Stat signature » d’un pays (esprit national du jeu) : les titulaires du
 * pays le plus représenté reçoivent +0,5 % par point de chimie de nationalité
 * (8 points au plus) sur cette stat. Table et formule lues dans le code du jeu
 * le 13/11/2026 (voir claude/bonus-de-nationalite-2026-11-13.md).
 */
export const SIGNATURE_STATS = [
  "pace",
  "shooting",
  "passing",
  "dribbling",
  "defending",
  "physical",
] as const;
export type SignatureStat = (typeof SIGNATURE_STATS)[number];

export const SIGNATURE_LABELS: Record<SignatureStat, string> = {
  pace: "vitesse",
  shooting: "tir",
  passing: "passe",
  dribbling: "dribble",
  defending: "défense",
  physical: "physique",
};

const EXPLICIT: Record<string, SignatureStat> = {
  england: "physical",
  spain: "passing",
  france: "pace",
  germany: "physical",
  italy: "defending",
  portugal: "dribbling",
  netherlands: "pace",
  belgium: "passing",
  poland: "shooting",
  sweden: "physical",
  norway: "shooting",
  denmark: "passing",
  croatia: "passing",
  serbia: "physical",
  switzerland: "defending",
  austria: "physical",
  greece: "defending",
  turkey: "shooting",
  ireland: "physical",
  scotland: "physical",
  wales: "pace",
  ukraine: "pace",
  czechia: "passing",
  russia: "physical",
  brazil: "dribbling",
  argentina: "dribbling",
  colombia: "dribbling",
  chile: "physical",
  uruguay: "defending",
  ecuador: "pace",
  paraguay: "defending",
  peru: "passing",
  "united states of america": "physical",
  mexico: "pace",
  canada: "pace",
  jamaica: "pace",
  "costa rica": "defending",
  nigeria: "pace",
  senegal: "physical",
  egypt: "shooting",
  cameroon: "physical",
  ghana: "physical",
  "côte d'ivoire": "physical",
  morocco: "dribbling",
  algeria: "dribbling",
  "south africa": "pace",
  tunisia: "defending",
  mali: "physical",
  japan: "passing",
  "south korea": "pace",
  "saudi arabia": "pace",
  iran: "defending",
  australia: "physical",
  "new zealand": "physical",
};

/** Autres écritures d’un même pays, comme dans le jeu. */
const ALIASES: Record<string, string> = {
  usa: "united states of america",
  "united states": "united states of america",
  "ivory coast": "côte d'ivoire",
  "cote d'ivoire": "côte d'ivoire",
  "czech republic": "czechia",
  "bosnia and herzegovina": "bosnia and herz.",
  bosnia: "bosnia and herz.",
  "dr congo": "dem. rep. congo",
  "democratic republic of the congo": "dem. rep. congo",
  "dominican republic": "dominican rep.",
  "north macedonia": "macedonia",
  "korea republic": "south korea",
};

/** Empreinte FNV-1a 32 bits (celle du jeu pour les pays hors table). */
function fnv1a(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x1000193) >>> 0;
  }
  return hash >>> 0;
}

export function nationSignature(
  nationality: string | null | undefined,
): SignatureStat | null {
  if (typeof nationality !== "string") return null;
  const raw = nationality.trim().toLowerCase();
  const key = ALIASES[raw] ?? raw;
  if (!key) return null;
  return EXPLICIT[key] ?? SIGNATURE_STATS[fnv1a(key) % SIGNATURE_STATS.length];
}

/** Libellé français de la stat signature, ou null si le pays est inconnu. */
export const signatureLabel = (nationality: string | null | undefined) => {
  const stat = nationSignature(nationality);
  return stat ? SIGNATURE_LABELS[stat] : null;
};
