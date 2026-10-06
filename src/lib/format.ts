export const number = (value: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
export const money = (value: number) => `${number(value)} GMC2`;
export const compact = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);

/** Montant court : 4M, 480k, 1,25M (sans espace avant l’unité). */
export const shortAmount = (value: number) =>
  compact(value).replace(/[\s\u00a0\u202f]+/gu, "");
