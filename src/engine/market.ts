/**
 * Estimation à partir des PRIX DEMANDÉS relevés sur le marché (annonces
 * de vente), pas de ventes conclues : c'est une indication, jamais un prix
 * garanti. Médiane, fourchette interquartile, écarts aberrants retirés.
 */
export interface AskingPrice {
  kind: "transfer" | "loan";
  price: number;
}
export interface MarketEstimate {
  n: number;
  median: number;
  low: number;
  high: number;
  confidence: "faible" | "indicative" | "solide";
}
const quantile = (sorted: number[], q: number) => {
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const next = sorted[base + 1] ?? sorted[base];
  return sorted[base] + (next - sorted[base]) * (position - base);
};
export function estimateFromAsking(
  observations: AskingPrice[],
  kind: AskingPrice["kind"] = "transfer",
): MarketEstimate | null {
  let prices = observations
    .filter(
      (row) => row.kind === kind && Number.isFinite(row.price) && row.price > 0,
    )
    .map((row) => row.price)
    .sort((a, b) => a - b);
  if (!prices.length) return null;
  if (prices.length >= 5) {
    const q1 = quantile(prices, 0.25),
      q3 = quantile(prices, 0.75),
      spread = q3 - q1;
    const kept = prices.filter(
      (price) => price >= q1 - 1.5 * spread && price <= q3 + 1.5 * spread,
    );
    if (kept.length >= Math.max(2, prices.length * 0.6)) prices = kept;
  }
  const n = prices.length;
  return {
    n,
    median: Math.round(quantile(prices, 0.5)),
    low: Math.round(quantile(prices, n >= 4 ? 0.25 : 0)),
    high: Math.round(quantile(prices, n >= 4 ? 0.75 : 1)),
    confidence: n >= 10 ? "solide" : n >= 3 ? "indicative" : "faible",
  };
}
