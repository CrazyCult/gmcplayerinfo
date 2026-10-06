import Link from "next/link";
import {
  CATALOG_AVAIL,
  CATALOG_SORTS,
  getCatalog,
  indexEnabled,
} from "@/data/gmc-index";
import { money } from "@/lib/format";
import { POSITIONS } from "@/types";
import Rating from "@/components/UI/Rating";

export const metadata = { title: "Tous les joueurs GameChase" };
export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    position?: string;
    page?: string;
    avail?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q?.slice(0, 100) || "";
  const position = POSITIONS.includes(
    params.position as (typeof POSITIONS)[number],
  )
    ? params.position!
    : "";
  const avail = CATALOG_AVAIL.find((value) => value === params.avail) ?? "";
  const sort =
    CATALOG_SORTS.find((value) => value === params.sort) ?? "overall";
  const page = Math.max(
    1,
    Math.min(20, Number.parseInt(params.page || "1", 10) || 1),
  );
  let catalog;
  try {
    if (indexEnabled())
      catalog = await getCatalog({ q, position, page, avail, sort });
  } catch {
    /* Render a recoverable state without exposing upstream credentials. */
  }
  const pageUrl = (nextPage: number) =>
    `/players?${new URLSearchParams({ q, position, avail, sort, page: String(nextPage) })}`;
  return (
    <div className="stack">
      <section className="card">
        <div className="eyebrow">INDEX COMMUNAUTAIRE</div>
        <h1>Tous les joueurs</h1>
        <p>
          Les effectifs lus par GMC Companion (fiche complète avec
          sous-attributs) et la base des joueurs du jeu (fiche légère : 6 stats,
          OVR, potentiel et prix demandés), relue chaque jour ; le marché est
          relu chaque heure.
        </p>
        <form action="/players" className="hero-actions">
          <input
            name="q"
            aria-label="Nom ou identifiant du joueur"
            placeholder="Début du nom ou du nom de famille"
            defaultValue={q}
            maxLength={100}
          />
          <select name="position" aria-label="Poste" defaultValue={position}>
            <option value="">Tous les postes</option>
            {POSITIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select name="avail" aria-label="Disponibilité" defaultValue={avail}>
            <option value="">Tous les joueurs</option>
            <option value="transfer">En vente</option>
            <option value="loan">Proposés en prêt</option>
            <option value="free">Agents libres</option>
            <option value="full">Fiches complètes</option>
          </select>
          <select name="sort" aria-label="Tri" defaultValue={sort}>
            <option value="overall">OVR décroissant</option>
            <option value="potential">Potentiel décroissant</option>
            <option value="gap">Marge de progression</option>
            <option value="price">Prix de vente croissant</option>
            <option value="loan">Prix de prêt croissant</option>
          </select>
          <button className="button primary" type="submit">
            Rechercher
          </button>
        </form>
      </section>
      {catalog ? (
        <section className="card">
          <p>
            {catalog.total.toLocaleString("fr-CH")}
            {catalog.capped ? "+" : ""} joueurs · page {catalog.page} /{" "}
            {Math.max(1, catalog.pages)}
            {catalog.capped && (
              <small className="muted">
                {" "}
                · affiche les 1 000 premiers : affine la recherche (nom, poste,
                disponibilité) pour aller plus loin
              </small>
            )}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Joueur</th>
                  <th>Poste</th>
                  <th>Âge</th>
                  <th>OVR</th>
                  <th>POT</th>
                  <th>Prix demandé</th>
                  <th>Club</th>
                  <th>Collecte</th>
                </tr>
              </thead>
              <tbody>
                {catalog.players.map(({ player, fetchedAt, light, market }) => (
                  <tr key={player.id}>
                    <td>
                      <Link href={`/player/${encodeURIComponent(player.id)}`}>
                        {player.name}
                      </Link>
                      {light && (
                        <small className="muted" title="6 stats seulement">
                          {" "}
                          · légère
                        </small>
                      )}
                    </td>
                    <td>{player.position}</td>
                    <td>{player.age}</td>
                    <td>
                      <Rating value={player.overall} />
                    </td>
                    <td>
                      <Rating value={player.potential} />
                    </td>
                    <td>
                      {market?.transferPrice
                        ? money(market.transferPrice)
                        : market?.loanFee
                          ? `prêt ${money(market.loanFee)}`
                          : "—"}
                    </td>
                    <td>
                      {market?.freeAgent ? "libre" : (market?.clubName ?? "—")}
                    </td>
                    <td>
                      {fetchedAt
                        ? new Date(fetchedAt).toLocaleDateString("fr-CH", {
                            timeZone: "Europe/Zurich",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {catalog.total === 0 && (
            <p>Aucun joueur ne correspond à ces critères.</p>
          )}
          <div className="hero-actions">
            {page > 1 && (
              <Link className="button" href={pageUrl(page - 1)}>
                ← Précédente
              </Link>
            )}
            {page < catalog.pages && (
              <Link className="button" href={pageUrl(page + 1)}>
                Suivante →
              </Link>
            )}
          </div>
        </section>
      ) : (
        <div className="notice">
          {indexEnabled()
            ? "L’index est momentanément indisponible. Réessayez dans quelques instants."
            : "La connexion à l’index doit être activée sur le serveur. Votre import local reste disponible."}{" "}
          <Link href="/squad">Importer mon effectif</Link>
        </div>
      )}
    </div>
  );
}
