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
import { money } from "@/lib/format";
import { subLabels } from "@/lib/i18n";
import Rating from "./UI/Rating";
import TrainingSimulator from "./TrainingSimulator";

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
}: {
  player: Player;
  trainingOnly?: boolean;
  remote?: boolean;
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
  return (
    <div className="stack">
      <section className="card">
        <div className="player-top">
          <Image
            className="portrait"
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
              {player.rarity && <span className="pill">{player.rarity}</span>}
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
        <div className="statline">
          <div>
            <strong>
              {player.overall} <small>→ {player.potential}</small>
            </strong>
            <small>OVR du jeu → potentiel</small>
          </div>
          <div>
            <strong>
              {player.fitness ?? "—"}
              <small> / 100</small>
            </strong>
            <small>Forme physique</small>
          </div>
          <div>
            <strong style={{ fontSize: 19 }}>
              {player.value === undefined ? "—" : money(player.value)}
            </strong>
            <small>Valeur du jeu · fourchette ±30 %</small>
          </div>
          <div>
            <strong style={{ fontSize: 19 }}>
              {player.wage === undefined ? "—" : money(player.wage)}
            </strong>
            <small>Salaire · unité non confirmée</small>
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
          <div className="pills">
            {player.traits.map((trait) => (
              <span className="pill accent" key={trait}>
                {trait}
              </span>
            ))}
          </div>
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
              : `${player.matchesPlayed} matchs · ${player.goals ?? 0} buts · ${player.assists ?? 0} passes${player.position === "GK" ? ` · ${player.cleanSheets ?? 0} clean sheets` : ""}`}
          </p>
        )}
      </section>
      {!trainingOnly && (
        <>
          <section className="card">
            <div className="section-head">
              <h2 style={{ margin: 0 }}>
                Attributs{" "}
                <small>
                  {light ? "· 6 stats du jeu" : "· simulation en direct"}
                </small>
              </h2>
              <span className="pill">Plafond {player.potential}</span>
            </div>
            {light && (
              <div className="notice">
                Fiche légère : la base du jeu ne donne que les 6 stats. OVR et
                notes par poste sont exacts ; sous-attributs, leviers et
                simulateur d’entraînement apparaîtront quand un utilisateur de
                GMC Companion aura ouvert la page du club de ce joueur.
              </div>
            )}
            <div className="player-stats">
              {light &&
                Object.keys(groups).map((stat) => (
                  <div className="attribute" key={stat}>
                    <small>{stat.toUpperCase()}</small>
                    <Rating value={stats[stat as keyof typeof stats]} />
                  </div>
                ))}
              {!light &&
                Object.entries(groups).map(([stat, keys]) => (
                  <details className="attribute" key={stat}>
                    <summary>
                      <small>{stat.toUpperCase()}</small>
                      <Rating value={stats[stat as keyof typeof stats]} />
                      <small>Voir le détail ↓</small>
                    </summary>
                    <div className="sub-list">
                      {keys.map((key) => (
                        <div className="sub-row" key={key}>
                          <span>
                            {subLabels[key]} <strong>{subs[key] ?? "—"}</strong>
                          </span>
                          <progress
                            max={Math.max(player.potential, subs[key] ?? 0)}
                            value={subs[key] ?? 0}
                            aria-label={subLabels[key]}
                          />
                        </div>
                      ))}
                    </div>
                  </details>
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
          <section className="card">
            <div className="section-head">
              <h2 style={{ margin: 0 }}>Notes par poste</h2>
              <label className="pill">
                <input
                  type="checkbox"
                  checked={fit}
                  onChange={(event) => setFit(event.target.checked)}
                />{" "}
                Adéquation estimée
              </label>
            </div>
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
          </section>
          {!light && (
            <details className="card">
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                Leviers d’OVR · coachs niveau 5
              </summary>
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
            </details>
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
        <TrainingSimulator player={player} onChange={setSubs} />
      )}
      {!trainingOnly && (
        <section className="card">
          <h2>Progression par les matchs</h2>
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
        </section>
      )}
    </div>
  );
}
