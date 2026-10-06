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
import {
  matchGain,
  matchesPerSeries,
  projectMatches,
} from "@/engine/matchProgression";
import { money, shortAmount } from "@/lib/format";
import { TRAITS, TRAIT_TIER_LABEL } from "@/lib/traits";
import { statLabels, subLabels } from "@/lib/i18n";
import Rating from "./UI/Rating";
import {
  RARITY_COLOR,
  RARITY_LABEL,
  attributeColor,
  attributeShare,
  playerRarity,
  tint,
} from "@/lib/colors";
import TrainingSimulator from "./TrainingSimulator";
import Fold from "./UI/Fold";
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
  club?: { id: string; name: string | null; freeAgent: boolean } | null;
}) {
  const [subs, setSubs] = useState<Subs>(player.attributes.subs),
    [fit, setFit] = useState(true);
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
  const bestPositions = [...ratings]
    .slice(0, 4)
    .map(
      (row) =>
        `${row.position} ${fit ? (row.adjusted ?? "—") : (row.raw ?? "—")}`,
    )
    .join(" · ");
  return (
    <div className="stack">
      <div className={trainingOnly ? undefined : "player-hero"}>
        <section className="card player-card">
          <div className="player-top">
            <Image
              className="portrait"
              style={{
                borderColor: rarityColor,
                boxShadow: `0 0 24px ${tint(rarityColor, 25)}`,
              }}
              src={portraitUrl(player)}
              alt={`Portrait de ${player.name}`}
              width={150}
              height={190}
              unoptimized={portraitUrl(player).endsWith(".svg")}
            />
            <div className="player-info">
              <div className="eyebrow">
                Fiche joueur ·{" "}
                {light
                  ? "base du jeu (fiche légère)"
                  : remote
                    ? "GMC Companion"
                    : "import local"}
              </div>
              <h1>{player.name}</h1>
              <div className="pills">
                <span className="pill accent">{player.position}</span>
                <span className="pill">{player.age} ans</span>
                {player.nationality && (
                  <span className="pill">{player.nationality}</span>
                )}
                <span
                  className="pill"
                  style={{
                    color: rarityColor,
                    borderColor: tint(rarityColor, 40),
                  }}
                >
                  {RARITY_LABEL[rarity]}
                </span>
                {club &&
                  (club.freeAgent ? (
                    <span className="pill club-pill">Agent libre</span>
                  ) : club.id ? (
                    <Link
                      className="pill club-pill"
                      href={`/squad?club=${encodeURIComponent(club.id)}`}
                      prefetch={false}
                      title="Voir l’effectif de ce club"
                    >
                      {club.name ?? "Club inconnu"}
                    </Link>
                  ) : (
                    <span className="pill club-pill">{club.name}</span>
                  ))}
                <span className="pill">
                  {player.preferredFoot === "left"
                    ? "Pied gauche"
                    : player.preferredFoot === "both"
                      ? "Ambidextre"
                      : player.preferredFoot === "right"
                        ? "Pied droit"
                        : "Pied inconnu"}
                </span>
              </div>
              <div className="player-links">
                {/^[0-9a-f-]{36}$/i.test(player.id) && (
                  <a
                    className="button"
                    href={`https://gamechase.io/gamev2/players/${encodeURIComponent(player.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Fiche dans GameChase ↗
                  </a>
                )}
                <Link
                  className="button"
                  href={`/compare?player1=${encodeURIComponent(localId)}`}
                >
                  Comparer
                </Link>
                {(!light || trainingOnly) && (
                  <Link
                    className="button primary"
                    href={`/player/${encodeURIComponent(localId)}${trainingOnly ? "" : "/training"}`}
                  >
                    {trainingOnly ? "Fiche complète" : "Simulateur plein écran"}
                  </Link>
                )}
              </div>
            </div>
          </div>
          <div className="statline player-statline">
            <div>
              <strong>
                <span style={{ color: rarityColor }}>{player.overall}</span>
                <span className="unit">→</span>
                <span
                  style={{
                    color:
                      RARITY_COLOR[playerRarity({ overall: player.potential })],
                  }}
                >
                  {player.potential}
                </span>
              </strong>
              <small>OVR → potentiel</small>
            </div>
            <div>
              <strong>
                {player.fitness ?? "—"}
                <span className="unit">/100</span>
              </strong>
              <small>Forme</small>
            </div>
            <div>
              <strong>
                {player.value === undefined ? "—" : shortAmount(player.value)}
                <span className="unit">GMC2</span>
              </strong>
              <small>Valeur du jeu</small>
            </div>
            <div>
              <strong>
                {player.wage === undefined ? "—" : shortAmount(player.wage)}
                <span className="unit">GMC2</span>
              </strong>
              <small>Salaire</small>
            </div>
          </div>
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
          {player.traits.length > 0 && (
            <ul className="traits">
              {player.traits.map((trait) => {
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
          )}
          {player.contractEnd && (
            <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
              Fin de contrat : {player.contractEnd}
              {player.contractDemand !== undefined
                ? ` · Renouvellement : ${money(player.contractDemand)}`
                : player.value !== undefined
                  ? ` · Budget contrat estimé : ${money(player.value * 0.04)}`
                  : ""}
            </p>
          )}
          {player.matchesPlayed !== undefined && (
            <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
              {player.matchesPlayed === 0
                ? "Aucun match joué"
                : `${player.matchesPlayed} match${player.matchesPlayed > 1 ? "s" : ""} · ${player.goals ?? 0} buts · ${player.assists ?? 0} passes${player.position === "GK" && player.cleanSheets ? ` · ${player.cleanSheets} clean sheets` : ""}`}
            </p>
          )}
        </section>
        {!trainingOnly && (
          <section className="card player-attributes">
            <div className="section-head">
              <h2 style={{ margin: 0 }}>
                Attributs{light && <small> · 6 stats du jeu</small>}
              </h2>
              <span className="pill">Plafond {player.potential}</span>
            </div>
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
                          <span>
                            {subLabels[key]}{" "}
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
                          </span>
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
          </section>
        )}
      </div>
      {!trainingOnly && (
        <>
          <Fold title="Notes par poste" summary={bestPositions} open>
            <div className="section-head">
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
                  En match, hors poste
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!fit}
                  className={`pill${!fit ? " accent" : ""}`}
                  onClick={() => setFit(false)}
                >
                  Après carte de poste
                </button>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              {fit
                ? "Force s’il joue à ce poste sans le changer : note au poste × adéquation du manuel (100 % son poste, 95 % proche, 90 % voisin, 85 % mauvaise ligne). Estimation : le manuel ne précise pas l’arrondi."
                : "OVR qu’il aurait s’il changeait de poste avec une carte de poste (formule d’OVR du jeu appliquée à ses stats). Une carte ne fait passer qu’à un poste voisin."}
            </p>
            <div className="ratings-grid">
              {ratings.map((row) => (
                <div className="position-row" key={row.position}>
                  <div>
                    <strong>{row.position}</strong>
                    {fit && (
                      <small title={`Coefficient ×${row.coefficient} — estimé`}>
                        {tiers[row.tier]} · ×{row.coefficient}
                      </small>
                    )}
                  </div>
                  <Rating value={fit ? row.adjusted : row.raw} />
                </div>
              ))}
            </div>
          </Fold>
          {!light && (
            <Fold
              title="Leviers d’OVR"
              summary="Le sous-attribut le moins cher pour gagner +1 OVR · coachs niveau 5"
            >
              {ovrLevers(
                { ...player, attributes: { ...player.attributes, subs } },
                { coaches: MAX_COACHES },
              )
                .filter((lever) => lever.progresses)
                .map((lever) => (
                  <div className="drill-row" key={lever.key}>
                    <strong>{subLabels[lever.key]}</strong>
                    <small>
                      +1 OVR · {lever.sessions} séances · {money(lever.cost)}
                    </small>
                  </div>
                ))}
            </Fold>
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
