import type { MarketInfo, PriceObservation } from "@/data/gmc-index";
import { estimateFromAsking } from "@/engine/market";
import { money } from "@/lib/format";

const day = (ms: number) =>
  new Date(ms).toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich" });

/** Marché : annonce en cours, historique des prix demandés, comparables. */
export default function MarketPanel({
  market,
  prices,
  comparables,
  value,
}: {
  market: MarketInfo;
  prices: PriceObservation[];
  comparables: PriceObservation[];
  value?: number;
}) {
  const estimate = estimateFromAsking(comparables);
  const loanEstimate = estimateFromAsking(comparables, "loan");
  if (!market && !prices.length && !estimate && !loanEstimate) return null;
  return (
    <section className="card">
      <h2>Marché</h2>
      <div className="statline">
        <div>
          <strong style={{ fontSize: 19 }}>
            {market?.transferPrice ? money(market.transferPrice) : "—"}
          </strong>
          <small>
            {market?.transferPrice ? "En vente · prix demandé" : "Pas en vente"}
          </small>
        </div>
        <div>
          <strong style={{ fontSize: 19 }}>
            {market?.loanFee ? money(market.loanFee) : "—"}
          </strong>
          <small>
            {market?.loanFee ? "Prêt proposé" : "Pas proposé en prêt"}
          </small>
        </div>
        <div>
          <strong style={{ fontSize: 19 }}>
            {estimate ? money(estimate.median) : "—"}
          </strong>
          <small>
            {estimate
              ? `Prix demandés comparables · ${money(estimate.low)} – ${money(estimate.high)}`
              : "Pas assez d’annonces comparables"}
          </small>
        </div>
        <div>
          <strong style={{ fontSize: 19 }}>
            {value === undefined ? "—" : money(value)}
          </strong>
          <small>Valeur du jeu</small>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        {estimate
          ? `Médiane de ${estimate.n} annonce(s) de joueurs au même poste, âge et OVR ±2, sur 30 jours (confiance ${estimate.confidence}). Ce sont des prix demandés, pas des ventes conclues.`
          : "Les annonces sont relevées par GMC Companion sur le marché du jeu, chaque heure."}
        {market?.freeAgent ? " · Agent libre." : ""}
        {market?.clubName && !market.freeAgent
          ? ` · Club : ${market.clubName}.`
          : ""}
        {loanEstimate
          ? ` · Prêts comparables : ${money(loanEstimate.median)} (${loanEstimate.n}).`
          : ""}
      </p>
      {prices.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>
            Historique des prix demandés ({prices.length})
          </summary>
          {prices.map((row, index) => (
            <div className="drill-row" key={index}>
              <strong>
                {row.kind === "loan" ? "Prêt" : "Vente"} · {money(row.price)}
              </strong>
              <small>
                OVR {row.overall ?? "—"} · {row.age ?? "—"} ans ·{" "}
                {row.first_seen ? `du ${day(row.first_seen)} ` : ""}au{" "}
                {day(row.last_seen)}
              </small>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
