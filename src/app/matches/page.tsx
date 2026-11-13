import Link from "next/link";
import {
  getAccountClub,
  getClub,
  getClubMatches,
  indexEnabled,
  type ClubMatch,
} from "@/data/gmc-index";
import { matchTrends } from "@/lib/matchTrends";
import { accountKey, authEnabled, getSession } from "@/lib/session";

export const metadata = { title: "Mes matchs" };

const fr = (value: number) => String(value).replace(".", ",");
const signed = (value: number) => (value > 0 ? "+" : "") + fr(value);
const day = (ms: number) =>
  new Date(ms).toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Zurich",
  });

function Notice({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card mini-card">
      <h1 className="mini-title">{title}</h1>
      <div className="muted">{children}</div>
    </section>
  );
}

function MatchCard({ match, open }: { match: ClubMatch; open: boolean }) {
  const { st, ins } = match;
  const result = match.gf > match.ga ? "V" : match.gf < match.ga ? "D" : "N";
  const players = [...st.players].sort((a, b) => (b.nt ?? 0) - (a.nt ?? 0));
  return (
    <details className="match-card" open={open}>
      <summary>
        <span className={`match-result result-${result}`}>{result}</span>
        <span className="match-score">
          {match.gf}-{match.ga}
        </span>
        <span className="match-opponent">
          {match.opponent ?? "Adversaire inconnu"}
          <small>
            {day(match.date)}
            {match.venue ? ` · ${match.venue}` : ""}
            {st.comp ? ` · ${st.comp}` : ""}
          </small>
        </span>
        <span className="match-verdict">{ins?.verdict ?? ""}</span>
        <span className="match-xg">
          xG {fr(st.xg[0])} – {fr(st.xg[1])}
        </span>
      </summary>
      <div className="match-body">
        <div className="match-points">
          {ins && ins.plus.length > 0 && (
            <div>
              <h3>Ce qui a marché</h3>
              <ul className="points plus">
                {ins.plus.map((point) => (
                  <li key={point.t}>{point.t}</li>
                ))}
              </ul>
            </div>
          )}
          {ins && ins.minus.length > 0 && (
            <div>
              <h3>Ce qui a coincé</h3>
              <ul className="points minus">
                {ins.minus.map((point) => (
                  <li key={point.t}>
                    {point.t}
                    {point.tip && <small>Piste : {point.tip}</small>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <dl className="match-stats">
          {(
            [
              ["Tirs", st.shots],
              ["Cadrés", st.sot],
              ["Grosses occasions", st.big],
              ["Arrêts", st.saves],
              ["Possession", st.poss],
              ["Corners", st.corners],
              ["OVR", st.ovr],
              ["Chimie", st.chem],
              ["Remplacements", st.subsUsed],
            ] as const
          ).map(([label, pair]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {pair[0]} – {pair[1]}
              </dd>
            </div>
          ))}
        </dl>
        <p className="muted match-tactic">
          {[
            st.set.formation ?? match.formation,
            st.set.playstyle,
            st.set.mentality,
            st.set.tempo && `tempo ${st.set.tempo}`,
            st.set.pressingStyle && `pressing ${st.set.pressingStyle}`,
            st.set.defensiveLine && `ligne ${st.set.defensiveLine}`,
          ]
            .filter(Boolean)
            .join(" · ")}
          {(st.oppSet.formation ?? match.oppFormation) &&
            ` — en face : ${[st.oppSet.formation ?? match.oppFormation, st.oppSet.playstyle, st.oppSet.mentality].filter(Boolean).join(" · ")}`}
        </p>
        {players.length > 0 && (
          <div className="table-wrap">
            <table className="match-players">
              <thead>
                <tr>
                  <th>Joueur</th>
                  <th>Poste</th>
                  <th>Note</th>
                  <th>Buts</th>
                  <th>Passes D.</th>
                  <th>Duels</th>
                  <th>Fatigue</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={player.id}>
                    <td className="name">
                      <Link href={`/player/${player.id}`} prefetch={false}>
                        {player.n}
                      </Link>
                      {player.sub?.startsWith("in") && (
                        <small className="muted">
                          {" "}
                          entré {player.sub.slice(2)}’
                        </small>
                      )}
                    </td>
                    <td>{player.p}</td>
                    <td>{player.nt == null ? "—" : fr(player.nt)}</td>
                    <td>{player.g || ""}</td>
                    <td>{player.a || ""}</td>
                    <td>
                      {player.w + player.l > 0
                        ? `${player.w}/${player.w + player.l}`
                        : "—"}
                    </td>
                    <td>{player.f}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

export default async function MatchesPage() {
  if (!indexEnabled() || !authEnabled())
    return (
      <Notice title="Mes matchs">
        Cette page demande la connexion au compte et l’index GMC Companion.
      </Notice>
    );
  const session = await getSession();
  if (!session)
    return (
      <Notice title="Mes matchs">
        Connecte-toi avec Google (en haut à droite) : les retours de match ne
        sont visibles que par le compte rattaché au club.
      </Notice>
    );
  let teamId: string | null = null;
  try {
    teamId = await getAccountClub(await accountKey(session.sub));
  } catch {
    return (
      <Notice title="Mes matchs">
        Impossible de retrouver ton club pour l’instant, réessaie dans un
        moment.
      </Notice>
    );
  }
  if (!teamId)
    return (
      <Notice title="Mes matchs">
        Rattache d’abord ton club à ton compte dans{" "}
        <Link href="/squad">Mon effectif</Link>.
      </Notice>
    );
  const [club, list] = await Promise.allSettled([
    getClub(teamId),
    getClubMatches(teamId),
  ]);
  const name = club.status === "fulfilled" ? club.value.name : null;
  if (list.status === "rejected")
    return (
      <Notice title="Mes matchs">
        Les retours de match sont momentanément indisponibles.
      </Notice>
    );
  const matches = list.value;
  if (!matches.length)
    return (
      <Notice title="Mes matchs">
        Aucun match reçu pour {name ?? "ton club"}. Ils arrivent tout seuls avec
        GMC Companion (version 2.64 ou plus) : ouvre le jeu, laisse-le une
        minute, ou clique sur « Importer mes matchs récents » dans le Journal de
        matchs.
      </Notice>
    );
  const trends = matchTrends(matches);
  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <div className="eyebrow">Retours de match</div>
          <h1>{name ?? "Mes matchs"}</h1>
          <p>
            {matches.length} match{matches.length > 1 ? "s" : ""} reçu
            {matches.length > 1 ? "s" : ""} de GMC Companion. Visible seulement
            par ton compte.
          </p>
        </div>
      </div>
      {trends && trends.n >= 3 && (
        <section className="card">
          <h2>Tendances sur {trends.n} matchs</h2>
          <div className="match-kpis">
            <div>
              <strong>
                {trends.wins} V · {trends.draws} N · {trends.losses} D
              </strong>
              <span>bilan</span>
            </div>
            <div>
              <strong>{signed(trends.finishing)}</strong>
              <span>
                finition : {trends.gf} buts pour {fr(trends.xgFor)} xG
              </span>
            </div>
            <div>
              <strong>{signed(trends.defending)}</strong>
              <span>
                défense : {trends.ga} encaissés pour {fr(trends.xgAgainst)} xG
              </span>
            </div>
            {trends.conversion != null && (
              <div>
                <strong>{trends.conversion} %</strong>
                <span>de tirs transformés</span>
              </div>
            )}
            {trends.centralShotsPct != null && (
              <div>
                <strong>{trends.centralShotsPct} %</strong>
                <span>des tirs dans l’axe</span>
              </div>
            )}
            <div>
              <strong>{trends.en90Avg} %</strong>
              <span>d’énergie à la 90e</span>
            </div>
          </div>
          {trends.conceded.length > 0 && (
            <p>
              <strong>Buts encaissés :</strong>{" "}
              {trends.conceded
                .slice(0, 5)
                .map(([label, count]) => `${count} sur ${label}`)
                .join(" · ")}
            </p>
          )}
          {trends.noSubLosses > 0 && (
            <p>
              {trends.noSubLosses} match{trends.noSubLosses > 1 ? "s" : ""} non
              gagné{trends.noSubLosses > 1 ? "s" : ""} sans aucun remplacement.
            </p>
          )}
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            Le jeu fixe le score puis construit le rapport autour : ces chiffres
            décrivent tes matchs, ils n’en prouvent pas la cause.
            {trends.xgAgrees &&
              ` Sur tes matchs avec un vainqueur, il avait le meilleur xG ${trends.xgAgrees[0]} fois sur ${trends.xgAgrees[1]}.`}{" "}
            Une tendance sur plusieurs matchs vaut plus qu’un match seul.
          </p>
        </section>
      )}
      <section className="card">
        <h2>Les matchs</h2>
        <div className="match-list">
          {matches.map((match, index) => (
            <MatchCard key={match.id} match={match} open={index === 0} />
          ))}
        </div>
      </section>
    </div>
  );
}
