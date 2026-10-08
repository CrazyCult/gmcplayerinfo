"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Player, Subs } from "@/types";
import { modelOvr } from "@/engine/ovr";
import { summaryStats, gkStats, isLight } from "@/engine/stats";
import { positionRatings } from "@/engine/positionFit";
import { FIELD_GROUPS, GK_GROUPS, MAX_COACHES } from "@/engine/tables";
import { ovrLevers } from "@/engine/planner";
import { coachSummary, useClubSettings } from "@/lib/trainingSettings";
import {
  matchGain,
  matchesPerSeries,
  projectMatches,
} from "@/engine/matchProgression";
import { money } from "@/lib/format";
import { TRAITS, TRAIT_TIER_LABEL } from "@/lib/traits";
import { statLabels, subLabels } from "@/lib/i18n";
import Rating, { ratingColors } from "./UI/Rating";
import {
  RARITY_COLOR,
  RARITY_LABEL,
  attributeColor,
  attributeShare,
  playerRarity,
} from "@/lib/colors";
import TrainingSimulator from "./TrainingSimulator";
import Fold from "./UI/Fold";
import LazyFold from "./UI/LazyFold";
import Gmc2 from "./UI/Gmc2";
import { countryFr } from "@/lib/countries";
import LoadFullButton from "./LoadFullButton";

export function portraitUrl(player: Player) {
  const url = player.portraitUrl;
  return url?.startsWith(
    "https://oqax3ftrhi4czkta.public.blob.vercel-storage.com/gamechase/",
  )
    ? url
    : "/assets/placeholder.svg";
}
export default function PlayerView({
  player,
  trainingOnly = false,
  remote = false,
  full,
  club,
}: {
  player: Player;
  trainingOnly?: boolean;
  remote?: boolean;
  /** Fiche légère distante : de quoi demander la fiche complète. */
  full?: { requestedAt?: number | null };
  /** Club actuel du joueur (fiche de l’index). */
  club?: {
    id: string;
    name: string | null;
    freeAgent: boolean;
    crest?: string | null;
  } | null;
}) {
  const [subs, setSubs] = useState<Subs>(player.attributes.subs),
    [fit, setFit] = useState(true);
  const training = useClubSettings();
  const [rating, setRating] = useState(7),
    [perWeek, setPerWeek] = useState(7);
  const light = isLight(player.attributes);
  const stats =
    player.position === "GK"
      ? gkStats(subs, player.attributes)
      : summaryStats(subs, player.attributes);
  const groups = player.position === "GK" ? GK_GROUPS : FIELD_GROUPS;
  const calculated = modelOvr(player, subs);
  const ratings = positionRatings(player, subs)
    .filter((row) =>
      player.position === "GK" ? row.position === "GK" : row.position !== "GK",
    )
    .sort(
      (a, b) =>
        (fit ? (b.adjusted ?? -1) : (b.raw ?? -1)) -
        (fit ? (a.adjusted ?? -1) : (a.raw ?? -1)),
    );
  const localId = remote ? player.id : `local:${player.id}`;
  const [startDay] = useState(() =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }),
  );
  const projection = projectMatches({
    age: player.age,
    overall: calculated ?? player.overall,
    potential: player.potential,
    rating,
    matchesPerWeek: perWeek,
    startDay,
  });
  const tiers = { natural: "P", good: "B", okay: "A", poor: "M" };
  const rarity = playerRarity(player);
  const rarityColor = RARITY_COLOR[rarity];

  const TIER_ORDER = { S: 0, A: 1, B: 2, "-": 3 } as const;
  const sortedTraits = [...player.traits].sort(
    (a, b) =>
      (TRAITS[a] ? TIER_ORDER[TRAITS[a].tier] : 4) -
      (TRAITS[b] ? TIER_ORDER[TRAITS[b].tier] : 4),
  );
  const bestPositions = ratings
    .slice(0, 4)
    .map(
      (row) =>
        `${row.position} ${fit ? (row.adjusted ?? "—") : (row.raw ?? "—")}`,
    )
    .join(" · ");
  return (
    <div className="stack">
      <section className="card mini-hero">
        <div className="mini-id">
          <Image
            className="portrait"
            style={{ borderColor: rarityColor }}
            src={portraitUrl(player)}
            alt={`Portrait de ${player.name}`}
            width={110}
            height={138}
            unoptimized={portraitUrl(player).endsWith(".svg")}
          />
          <div className="mini-id-text">
            <div className="mini-kicker">
              {club && (
                <>
                  {club.freeAgent ? (
                    "Agent libre"
                  ) : club.id ? (
                    <Link
                      href={`/squad?club=${encodeURIComponent(club.id)}`}
                      prefetch={false}
                      title="Voir l’effectif de ce club"
                    >
                      {club.crest &&
                        /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(
                          club.crest,
                        ) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="kicker-crest"
                            src={club.crest}
                            alt=""
                            width={18}
                            height={18}
                            referrerPolicy="no-referrer"
                          />
                        )}
                      {club.name ?? "Club inconnu"}
                    </Link>
                  ) : (
                    club.name
                  )}
                  {light && " · "}
                </>
              )}
              {light && <span className="muted">fiche légère</span>}
            </div>
            <h1>
              <span className="pos-badge" title="Poste">
                {player.position}
              </span>
              {player.name}
            </h1>
            <div className="mini-ovr">
              <span
                className="rating-chip"
                style={ratingColors(player.overall)}
              >
                {player.overall}
              </span>
              <span className="muted">→</span>
              <span
                className="rating-chip"
                style={ratingColors(player.potential)}
              >
                {player.potential}
              </span>
              <small className="muted">OVR → potentiel</small>
            </div>
            <div className="mini-links">
              {/^[0-9a-f-]{36}$/i.test(player.id) && (
                <a
                  href={`https://gamechase.io/gamev2/players/${encodeURIComponent(player.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GameChase ↗
                </a>
              )}
              <Link href={`/compare?player1=${encodeURIComponent(localId)}`}>
                Comparer
              </Link>
              {trainingOnly && (
                <Link href={`/player/${encodeURIComponent(localId)}`}>
                  Fiche complète
                </Link>
              )}
            </div>
          </div>
        </div>
        {club?.crest &&
        /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//.test(
          club.crest,
        ) ? (
          <div className="mini-crest">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={club.crest}
              alt={`Logo de ${club.name ?? "son club"}`}
              width={72}
              height={72}
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className="mini-crest mini-crest-empty" aria-hidden="true" />
        )}
        <dl className="mini-details">
          <div>
            <dt>Âge</dt>
            <dd>{player.age} ans</dd>
          </div>
          <div>
            <dt>Pays</dt>
            <dd>{countryFr(player.nationality, player.flagCode) ?? "—"}</dd>
          </div>
          <div>
            <dt>Pied</dt>
            <dd>
              {player.preferredFoot === "left"
                ? "Gauche"
                : player.preferredFoot === "both"
                  ? "Les deux"
                  : player.preferredFoot === "right"
                    ? "Droit"
                    : "—"}
            </dd>
          </div>
          <div>
            <dt>Rareté</dt>
            <dd style={{ color: rarityColor }}>{RARITY_LABEL[rarity]}</dd>
          </div>
          <div>
            <dt>Valeur</dt>
            <dd>
              {player.value === undefined ? "—" : <Gmc2 value={player.value} />}
            </dd>
          </div>
          <div>
            <dt>Salaire</dt>
            <dd>
              {player.wage === undefined ? "—" : <Gmc2 value={player.wage} />}
            </dd>
          </div>
          {player.matchesPlayed !== undefined && (
            <div>
              <dt>Matchs</dt>
              <dd>
                {player.matchesPlayed} · {player.goals ?? 0} but
                {(player.goals ?? 0) > 1 ? "s" : ""} · {player.assists ?? 0}{" "}
                P.D.
              </dd>
            </div>
          )}
          {/* Demande du jeu si le contrat est en attente ; sinon la règle du
              jeu : un joueur rare ou mieux réclame 4 % de sa valeur en fin de
              saison. */}
          {(player.contractDemand !== undefined ||
            (player.value !== undefined &&
              ["rare", "epic", "legendary", "galactico"].includes(rarity))) && (
            <div
              title={
                player.contractDemand !== undefined
                  ? "Demande de renouvellement envoyée par le jeu"
                  : "Règle du jeu : 4 % de la valeur en fin de saison (joueurs rares ou mieux)"
              }
            >
              <dt>Renouvellement</dt>
              <dd>
                {player.contractDemand !== undefined ? (
                  <Gmc2 value={player.contractDemand} />
                ) : (
                  <>
                    ≈ <Gmc2 value={(player.value ?? 0) * 0.04} />
                  </>
                )}
              </dd>
            </div>
          )}
        </dl>
      </section>
      {modelOvr(player) !== player.overall && (
        <div className="notice warning">
          OVR du jeu {player.overall} · formule initiale{" "}
          {modelOvr(player) ?? "incomplète"}. Les simulations utilisent la
          formule.
        </div>
      )}
      {subs !== player.attributes.subs && (
        <div className="notice">
          Simulation en cours : OVR calculé {modelOvr(player) ?? "—"} →{" "}
          {calculated ?? "—"}. Les données importées sont conservées.
        </div>
      )}
      {!trainingOnly && (
        <div className="mini-stats">
          {Object.keys(groups).map((stat, index) => (
            <div
              className="mini-stat"
              key={stat}
              style={{ ["--stat" as string]: `var(--stat-${index + 1})` }}
            >
              <span>{statLabels[stat] ?? stat.toUpperCase()}</span>
              <strong
                style={{
                  color: attributeColor(
                    stats[stat as keyof typeof stats],
                    player.potential,
                  ),
                }}
              >
                {stats[stat as keyof typeof stats] ?? "—"}
              </strong>
            </div>
          ))}
        </div>
      )}
      {player.traits.length > 0 && (
        <Fold
          title="Traits"
          summary={sortedTraits
            .map((trait) => {
              const tier = TRAITS[trait]?.tier;
              return tier
                ? `${trait} (${tier === "-" ? "défaut" : tier})`
                : trait;
            })
            .join(" · ")}
        >
          <ul className="traits">
            {sortedTraits.map((trait) => {
              const info = TRAITS[trait];
              return (
                <li key={trait}>
                  <div className="trait-head">
                    <span className="pill accent">{trait}</span>
                    {info && (
                      <span
                        className={`trait-tier tier-${info.tier === "-" ? "down" : info.tier}`}
                      >
                        {TRAIT_TIER_LABEL[info.tier]}
                      </span>
                    )}
                    {info && <small className="muted">{info.scope}</small>}
                  </div>
                  {info ? (
                    <p>
                      {info.summary} <strong>{info.effect}</strong>
                    </p>
                  ) : (
                    <p className="muted">Effet inconnu pour l’instant.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Fold>
      )}
      {!trainingOnly && (
        <>
          <Fold
            title="Attributs détaillés"
            summary={
              light
                ? "Fiche légère : 6 stats seulement"
                : `${Object.values(groups).reduce((n, keys) => n + keys.length, 0)} sous-attributs · plafond ${player.potential}`
            }
          >
            {light && (
              <div className="notice">
                Fiche légère : la base du jeu ne donne que les 6 stats. OVR et
                notes par poste sont exacts ; sous-attributs, leviers et
                simulateur d’entraînement apparaîtront quand un utilisateur de
                GMC Companion aura ouvert la fiche de ce joueur ou la page de
                son club.
              </div>
            )}
            {light && remote && full && (
              <div style={{ margin: "14px 0" }}>
                <LoadFullButton
                  playerId={player.id}
                  requestedAt={full.requestedAt}
                />
              </div>
            )}
            <div className="player-stats">
              {Object.entries(groups).map(([stat, keys], index) => (
                <div
                  className="attribute"
                  key={stat}
                  style={{ ["--stat" as string]: `var(--stat-${index + 1})` }}
                >
                  <div className="attribute-head">
                    <small>{statLabels[stat] ?? stat.toUpperCase()}</small>
                    <Rating
                      value={stats[stat as keyof typeof stats]}
                      color={attributeColor(
                        stats[stat as keyof typeof stats],
                        player.potential,
                      )}
                    />
                  </div>
                  {!light && (
                    <div className="sub-list">
                      {keys.map((key) => (
                        <div className="sub-row" key={key}>
                          <span className="sub-label">{subLabels[key]}</span>
                          <strong
                            style={{
                              color: attributeColor(
                                subs[key],
                                player.potential,
                              ),
                            }}
                          >
                            {subs[key] ?? "—"}
                          </strong>
                          <span
                            className="attr-bar"
                            role="meter"
                            aria-label={subLabels[key]}
                            aria-valuenow={subs[key] ?? 0}
                            aria-valuemax={player.potential}
                          >
                            <span
                              style={{
                                width: `${attributeShare(subs[key], player.potential)}%`,
                                background: attributeColor(
                                  subs[key],
                                  player.potential,
                                ),
                              }}
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!light && (
              <p
                className="muted"
                style={{ fontSize: 12, marginTop: 18, marginBottom: 0 }}
              >
                Première touche : {subs.firstTouch ?? "—"} · n’entre dans aucune
                stat.
              </p>
            )}
          </Fold>
          <Fold title="Notes par poste" summary={bestPositions}>
            <div className="mini-head">
              <div
                className="pills"
                role="radiogroup"
                aria-label="Type de note"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={fit}
                  className={`pill${fit ? " accent" : ""}`}
                  onClick={() => setFit(true)}
                >
                  En match
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!fit}
                  className={`pill${!fit ? " accent" : ""}`}
                  onClick={() => setFit(false)}
                >
                  Carte de poste
                </button>
              </div>
            </div>
            <p className="muted mini-note">
              {fit
                ? "S’il joue à ce poste sans le changer : note au poste × adéquation (100 % son poste, 95 % proche, 90 % voisin, 85 % mauvaise ligne). Estimation."
                : "OVR qu’il aurait après une carte de poste (formule du jeu). Une carte ne fait passer qu’à un poste voisin."}
            </p>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>Poste</th>
                  <th>{fit ? "Adéquation" : ""}</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {ratings.map((row) => {
                  const value = fit ? row.adjusted : row.raw;
                  return (
                    <tr key={row.position}>
                      <td>
                        <strong>{row.position}</strong>
                      </td>
                      <td className="muted">
                        {fit
                          ? `${Math.round(row.coefficient * 100)} % · ${tiers[row.tier]}`
                          : ""}
                      </td>
                      <td
                        style={{
                          color:
                            value === undefined
                              ? undefined
                              : RARITY_COLOR[playerRarity({ overall: value })],
                        }}
                      >
                        <strong>{value ?? "—"}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Fold>
        </>
      )}
      {!trainingOnly && (
        <>
          {!light && (
            <LazyFold
              title="Leviers d’OVR"
              summary={`Le sous-attribut le moins cher pour gagner +1 OVR · ${training.saved ? coachSummary(training) : "coachs niveau 5"}`}
            >
              {() =>
                ovrLevers(
                  { ...player, attributes: { ...player.attributes, subs } },
                  training.saved
                    ? { coaches: training.coaches, center: training.center }
                    : { coaches: MAX_COACHES, center: 5 },
                )
                  .filter((lever) => lever.progresses)
                  .map((lever) => (
                    <div className="drill-row" key={lever.key}>
                      <strong>{subLabels[lever.key]}</strong>
                      <small>
                        +1 OVR · {lever.sessions} séances · {money(lever.cost)}
                      </small>
                    </div>
                  ))
              }
            </LazyFold>
          )}
        </>
      )}
      {light ? (
        trainingOnly && (
          <div className="notice">
            Simulateur indisponible : les sous-attributs de ce joueur ne sont
            pas encore connus (fiche légère de la base du jeu).
          </div>
        )
      ) : (
        <TrainingSimulator
          player={player}
          onChange={setSubs}
          open={trainingOnly}
        />
      )}
      {!trainingOnly && (
        <Fold
          title="Progression par les matchs"
          summary={
            matchesPerSeries(player.age, calculated ?? player.overall) === null
              ? "Plus de progression par les matchs après 30 ans"
              : `+${matchGain(rating)} par série de ${matchesPerSeries(player.age, calculated ?? player.overall)} matchs`
          }
        >
          <div className="notice">
            Projection estimée. Matchs officiels d’au moins 45 minutes ;
            vieillissement estimé à +1 an tous les 40 jours. Aucun historique
            réel disponible pour un import local.
          </div>
          <div className="settings" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Note moyenne attendue : {rating.toFixed(2)}
              <input
                type="range"
                min="6"
                max="9"
                step="0.05"
                value={rating}
                onChange={(event) => setRating(Number(event.target.value))}
              />
            </label>
            <label>
              Matchs par semaine : {perWeek}
              <input
                type="range"
                min="0"
                max="28"
                step="1"
                value={perWeek}
                onChange={(event) => setPerWeek(Number(event.target.value))}
              />
            </label>
          </div>
          <p className="muted" style={{ marginTop: 18 }}>
            {matchesPerSeries(player.age, calculated ?? player.overall) === null
              ? "À partir de 31 ans, les matchs ne font plus progresser l’OVR."
              : `+${matchGain(rating)} par série de ${matchesPerSeries(player.age, calculated ?? player.overall)} matchs.`}
          </p>
          {projection.length > 0 && (
            <div className="milestones">
              {projection.map((point, index) => (
                <div className="milestone" key={index}>
                  <strong>{point.overall}</strong>
                  <small>{point.day}</small>
                  <small>{point.age} ans · projection</small>
                </div>
              ))}
            </div>
          )}
        </Fold>
      )}
    </div>
  );
}
