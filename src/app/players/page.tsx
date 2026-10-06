import Link from "next/link";
import { getCatalog, indexEnabled } from "@/data/gmc-index";
import { POSITIONS } from "@/types";
import Rating from "@/components/UI/Rating";

export const metadata = { title: "Tous les joueurs GMC Companion" };
export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; position?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.slice(0, 100) || "";
  const position = POSITIONS.includes(
    params.position as (typeof POSITIONS)[number],
  )
    ? params.position!
    : "";
  const page = Math.max(
    1,
    Math.min(1000000, Number.parseInt(params.page || "1", 10) || 1),
  );
  let catalog;
  try {
    if (indexEnabled()) catalog = await getCatalog({ q, position, page });
  } catch {
    /* Render a recoverable state without exposing upstream credentials. */
  }
  const pageUrl = (nextPage: number) =>
    `/players?${new URLSearchParams({ q, position, page: String(nextPage) })}`;
  return (
    <div className="stack">
      <section className="card">
        <div className="eyebrow">INDEX COMMUNAUTAIRE</div>
        <h1>Tous les joueurs collectés</h1>
        <p>
          Les effectifs lus par GMC Companion sont disponibles ici. Chaque
          joueur apparaît avec sa collecte la plus récente, même après un
          transfert.
        </p>
        <form action="/players" className="hero-actions">
          <input
            name="q"
            aria-label="Nom ou identifiant du joueur"
            placeholder="Nom ou identifiant"
            defaultValue={q}
            maxLength={100}
          />
          <select name="position" aria-label="Poste" defaultValue={position}>
            <option value="">Tous les postes</option>
            {POSITIONS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <button className="button primary" type="submit">
            Rechercher
          </button>
        </form>
      </section>
      {catalog ? (
        <section className="card">
          <p>
            {catalog.total.toLocaleString("fr-CH")} joueurs · page{" "}
            {catalog.page} / {Math.max(1, catalog.pages)}
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
                  <th>Dernière collecte</th>
                </tr>
              </thead>
              <tbody>
                {catalog.players.map(({ player, fetchedAt }) => (
                  <tr key={player.id}>
                    <td>
                      <Link href={`/player/${encodeURIComponent(player.id)}`}>
                        {player.name}
                      </Link>
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
                      {new Date(fetchedAt).toLocaleDateString("fr-CH", {
                        timeZone: "Europe/Zurich",
                      })}
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
