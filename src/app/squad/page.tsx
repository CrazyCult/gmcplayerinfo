import Link from "next/link";
import SquadImport from "@/components/SquadImport";
import SquadTable from "@/components/SquadTable";
import SquadExport from "@/components/SquadExport";
import SquadUpdateButton from "@/components/SquadUpdateButton";
import GameSettingsSync from "@/components/GameSettingsSync";
import {
  IndexError,
  getAccountClub,
  getClub,
  indexEnabled,
  searchClubs,
  type ClubHit,
  type ClubSquad,
} from "@/data/gmc-index";
import { accountKey, authEnabled, getSession, isPremium } from "@/lib/session";
import { linkClub, unlinkClub } from "./actions";
import type { Rarity } from "@/types";

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

  if (!indexEnabled())
    return (
      <>
        <SquadImport />
      </>
    );

  const session = authEnabled() ? await getSession() : null;
  // An explicit club does not depend on the account lookup. Start it now,
  // retaining the account lookup for the existing link/unlink controls.
  const askedClub = asked
    ? getClub(asked).then(
        (club) => ({ club, error: null }),
        (error: unknown) => ({ club: null, error }),
      )
    : null;
  const premium = await isPremium(session);
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
      if (askedClub) {
        const result = await askedClub;
        if (result.error) throw result.error;
        club = result.club;
      } else {
        club = await getClub(teamId);
      }
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
  // Logo du club : seulement une image hébergée par le jeu (stockage Vercel).
  const crest =
    club?.crest &&
    /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(club.crest)
      ? club.crest
      : null;
  const here = club
    ? `/squad?club=${encodeURIComponent(club.teamId)}`
    : "/squad";

  return (
    <>
      <div className={crest ? "section-head club-hero" : "section-head"}>
        {crest && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="club-hero-glow"
              src={crest}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="club-hero-crest"
              src={crest}
              alt={`Logo de ${club?.name ?? "ce club"}`}
              width={104}
              height={104}
              referrerPolicy="no-referrer"
            />
          </>
        )}
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
        <SquadUpdateButton
          key={`${club.teamId}:${club.requestedAt}:${club.fetchedAt}`}
          teamId={club.teamId}
          requestedAt={club.requestedAt}
          primary={isLinked || !session}
          title={
            isLinked
              ? "C’est le club rattaché à ton compte."
              : session
                ? "Est-ce ton club ?"
                : authEnabled()
                  ? "Connecte-toi pour retrouver ce club sur tous tes appareils."
                  : "Effectif de ce club"
          }
        >
          {isLinked ? (
            <form action={unlinkClub}>
              <button className="button subtle">Changer de club</button>
            </form>
          ) : session ? (
            <>
              <Link
                className="button subtle"
                href="/squad?changer=1"
                prefetch={false}
              >
                Chercher un autre club
              </Link>
              <form action={linkClub}>
                <input type="hidden" name="teamId" value={club.teamId} />
                <button className="button primary">
                  Rattacher à mon compte
                </button>
              </form>
            </>
          ) : authEnabled() ? (
            <a
              className="button"
              href={`/api/auth/google?next=${encodeURIComponent(here)}`}
            >
              Se connecter avec Google
            </a>
          ) : (
            <Link
              className="button subtle"
              href="/squad?changer=1"
              prefetch={false}
            >
              Chercher un autre club
            </Link>
          )}
        </SquadUpdateButton>
      )}

      {club ? (
        club.players.length ? (
          <SquadTable
            players={club.players.map((p) =>
              // Rareté manquante dans la page club du jeu : celle de l’extension.
              !p.player.rarity && club.extras?.rarities?.[p.player.id]
                ? {
                    ...p.player,
                    rarity: club.extras.rarities[p.player.id] as Rarity,
                  }
                : p.player,
            )}
            lineup={club.extras?.lineup ?? null}
            hrefPrefix="/player/"
            lightIds={club.players
              .filter((p) => p.light)
              .map((p) => p.player.id)}
            premium={premium}
            loans={club.extras?.loans}
            clubName={club.name}
            settingsNote={
              isLinked && club.extras?.coaches && club.extras.center ? (
                <GameSettingsSync
                  coaches={club.extras.coaches}
                  center={club.extras.center}
                  updatedAt={club.extras.updatedAt}
                />
              ) : undefined
            }
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
      <SquadExport
        key={club?.teamId || "site"}
        scope={club?.teamId || "site"}
        players={club?.players.map((p) => p.player) ?? []}
        collectedAt={club?.fetchedAt ?? undefined}
        clubName={club?.name ?? undefined}
      />
    </>
  );
}
