import Link from "next/link";
import SquadImport from "@/components/SquadImport";
import SquadTable from "@/components/SquadTable";
import {
  IndexError,
  getAccountClub,
  getClub,
  indexEnabled,
  searchClubs,
  type ClubHit,
  type ClubSquad,
} from "@/data/gmc-index";
import { accountKey, authEnabled, getSession } from "@/lib/session";
import { linkClub, unlinkClub } from "./actions";

export const metadata = { title: "Mon effectif" };

const LOGIN_ERRORS: Record<string, string> = {
  annulee: "Connexion Google annulée.",
  expiree: "La connexion a expiré, recommence.",
  refusee: "Google a refusé la connexion.",
  indisponible: "Connexion Google momentanément indisponible.",
};
const date = (ms: number) =>
  new Date(ms).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  });

export default async function SquadPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || "";
  };
  const asked = one("club").slice(0, 64),
    q = one("q").slice(0, 60),
    changing = one("changer") === "1",
    loginError = LOGIN_ERRORS[one("connexion")];

  if (!indexEnabled()) return <SquadImport />;

  const session = authEnabled() ? await getSession() : null;
  let linked: string | null = null,
    problem = "";
  if (session) {
    try {
      linked = await getAccountClub(await accountKey(session.sub));
    } catch {
      problem = "Impossible de retrouver le club rattaché pour l’instant.";
    }
  }
  const teamId = asked || (changing ? "" : linked || "");
  let club: ClubSquad | null = null;
  if (teamId) {
    try {
      club = await getClub(teamId);
    } catch (error) {
      problem =
        error instanceof IndexError && error.status === 404
          ? "Ce club n’est pas encore connu de l’index."
          : "L’index est momentanément indisponible.";
    }
  }
  let hits: ClubHit[] = [];
  if (!club && q.length >= 2) {
    try {
      hits = await searchClubs(q);
    } catch {
      problem = "Recherche momentanément indisponible.";
    }
  }
  const isLinked = Boolean(club && linked === club.teamId);
  const here = club
    ? `/squad?club=${encodeURIComponent(club.teamId)}`
    : "/squad";

  return (
    <>
      <div className="section-head">
        <div>
          <div className="eyebrow">Votre vestiaire</div>
          <h1>{club?.name ?? "Mon effectif"}</h1>
          <p>
            {club
              ? club.fetchedAt
                ? `Effectif complet lu le ${date(club.fetchedAt)}.`
                : "Fiches légères de la base du jeu : l’effectif complet arrive dès qu’une extension GMC Companion lit le club."
              : "Retrouvez votre club, ses notes et le plan d’entraînement de chaque joueur."}
          </p>
        </div>
      </div>

      {loginError && <div className="notice warning">{loginError}</div>}
      {problem && <div className="notice warning">{problem}</div>}

      {club && (
        <div
          className="notice"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {isLinked ? (
            <>
              <span>C’est le club rattaché à ton compte.</span>
              <form action={unlinkClub}>
                <button className="button subtle">Changer de club</button>
              </form>
            </>
          ) : session ? (
            <>
              <span>Est-ce ton club ?</span>
              <form action={linkClub}>
                <input type="hidden" name="teamId" value={club.teamId} />
                <button className="button primary">
                  Rattacher à mon compte
                </button>
              </form>
              <Link href="/squad?changer=1" prefetch={false}>
                Chercher un autre club
              </Link>
            </>
          ) : authEnabled() ? (
            <>
              <span>
                Connecte-toi pour retrouver ce club sur tous tes appareils.
              </span>
              <a
                className="button primary"
                href={`/api/auth/google?next=${encodeURIComponent(here)}`}
              >
                Se connecter avec Google
              </a>
            </>
          ) : (
            <Link href="/squad?changer=1" prefetch={false}>
              Chercher un autre club
            </Link>
          )}
          {club.requestedAt && (
            <small className="muted">
              Mise à jour demandée aux extensions le {date(club.requestedAt)}.
            </small>
          )}
        </div>
      )}

      {club ? (
        club.players.length ? (
          <SquadTable
            players={club.players.map((p) => p.player)}
            hrefPrefix="/player/"
            lightIds={club.players
              .filter((p) => p.light)
              .map((p) => p.player.id)}
          />
        ) : (
          <div className="empty">
            <h2>Aucun joueur connu pour l’instant.</h2>
            <p>L’effectif s’affichera dès qu’une extension aura lu le club.</p>
          </div>
        )
      ) : (
        <section className="card">
          <h2>Trouver mon club</h2>
          <p className="muted">
            Avec l’extension GMC Companion, le bouton « Mon effectif sur le site
            » ouvre directement ton club. Sinon, cherche-le par son nom.
          </p>
          <form method="get" action="/squad" className="filters">
            <input
              name="q"
              defaultValue={q}
              placeholder="Nom du club…"
              aria-label="Nom du club"
              minLength={2}
              required
            />
            <button className="button primary">Chercher</button>
          </form>
          {q.length >= 2 && (
            <ul className="club-hits">
              {hits.length ? (
                hits.map((hit) => (
                  <li key={hit.teamId}>
                    <Link
                      href={`/squad?club=${encodeURIComponent(hit.teamId)}`}
                      prefetch={false}
                    >
                      {hit.name}
                    </Link>
                    <small className="muted">
                      {hit.fetchedAt
                        ? ` · effectif lu le ${date(hit.fetchedAt)}`
                        : " · fiches légères"}
                    </small>
                  </li>
                ))
              ) : (
                <li className="muted">Aucun club trouvé.</li>
              )}
            </ul>
          )}
        </section>
      )}

      <details className="card" style={{ marginTop: 24 }}>
        <summary>
          <strong>Importer un fichier</strong>{" "}
          <small className="muted">
            (sans compte, reste dans ce navigateur)
          </small>
        </summary>
        <SquadImport embedded />
      </details>
    </>
  );
}
