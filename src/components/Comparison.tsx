"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSquad } from "@/lib/local-squad";
import { summaryStats, gkStats } from "@/engine/stats";
import { FIELD_SUBS, GK_SUBS, POSITIONS, type Player } from "@/types";
import Search from "./Search";
import { planTraining } from "@/engine/planner";
import { MAX_COACHES } from "@/engine/tables";
import { positionRatings } from "@/engine/positionFit";
import { money } from "@/lib/format";
import { subLabels } from "@/lib/i18n";
import { portraitUrl } from "./PlayerView";
import Rating from "./UI/Rating";

export default function Comparison({
  player1 = "",
  player2 = "",
  remotePlayers = [],
  remote = false,
}: {
  player1?: string;
  player2?: string;
  remotePlayers?: Player[];
  remote?: boolean;
}) {
  const { players } = useSquad();
  const router = useRouter();
  const [ids, setIds] = useState([player1, player2]);
  const [fit, setFit] = useState(false);
  const selected = ids.map((id) =>
    id.startsWith("local:")
      ? players.find((player) => `local:${player.id}` === id)
      : remotePlayers.find((player) => player.id === id),
  );
  function select(index: number, id: string) {
    const next = ids.map((value, i) => (i === index ? id : value));
    setIds(next);
    const params = new URLSearchParams();
    next.forEach((value, i) => {
      if (value) params.set(`player${i + 1}`, value);
    });
    router.replace(`/compare${params.size ? `?${params}` : ""}`, {
      scroll: false,
    });
  }
  const row = (label: string, left?: number, right?: number) => (
    <div className="compare-row" key={label}>
      <div>
        {left !== undefined && right !== undefined && left > right && (
          <b aria-label="Meilleur joueur">★</b>
        )}
        <Rating value={left} />
      </div>
      <span>{label}</span>
      <div>
        <Rating value={right} />
        {left !== undefined && right !== undefined && right > left && (
          <b aria-label="Meilleur joueur">★</b>
        )}
      </div>
    </div>
  );
  return (
    <>
      <div className="section-head">
        <div>
          <div className="eyebrow">Face à face</div>
          <h1>Comparer les joueurs</h1>
          <p>
            Deux profils, les mêmes critères. L’étoile signale la meilleure
            note.
          </p>
        </div>
      </div>
      <section className="card">
        <div className="compare-selectors">
          {ids.map((id, index) => (
            <div key={index}>
              <label>
                <small>Joueur {index + 1}</small>
                <select
                  value={id}
                  onChange={(event) => select(index, event.target.value)}
                >
                  <option value="">Choisir un joueur…</option>
                  {remotePlayers.map((player) => (
                    <option key={`remote:${player.id}`} value={player.id}>
                      {player.name} · {player.position} · {player.overall} →{" "}
                      {player.potential}
                    </option>
                  ))}
                  {players.map((player) => (
                    <option key={player.id} value={`local:${player.id}`}>
                      {player.name} · {player.position} · {player.overall} →{" "}
                      {player.potential}
                    </option>
                  ))}
                </select>
              </label>
              {remote && <Search remote onSelect={(id) => select(index, id)} />}
            </div>
          ))}
        </div>
        <div className="compare-header">
          {selected[0] ? (
            <div>
              <Image
                className="portrait"
                src={portraitUrl(selected[0])}
                alt={selected[0].name}
                width={110}
                height={140}
              />
              <h2>{selected[0].name}</h2>
              <small>
                {selected[0].position} · {selected[0].age} ans
              </small>
            </div>
          ) : (
            <div className="muted">Premier joueur</div>
          )}
          <span className="eyebrow" style={{ justifyContent: "center" }}>
            VS
          </span>
          {selected[1] ? (
            <div>
              <Image
                className="portrait"
                src={portraitUrl(selected[1])}
                alt={selected[1].name}
                width={110}
                height={140}
              />
              <h2>{selected[1].name}</h2>
              <small>
                {selected[1].position} · {selected[1].age} ans
              </small>
            </div>
          ) : (
            <div className="muted">Second joueur</div>
          )}
        </div>
        {selected.every(Boolean) ? (
          <>
            {row("OVR du jeu", selected[0]!.overall, selected[1]!.overall)}
            {row("Potentiel", selected[0]!.potential, selected[1]!.potential)}
            {[false, true].map((keeper) => {
              if (
                !selected.some(
                  (player) => (player!.position === "GK") === keeper,
                )
              )
                return null;
              const stats = selected.map((player) =>
                (player!.position === "GK") === keeper
                  ? keeper
                    ? gkStats(player!.attributes.subs)
                    : summaryStats(player!.attributes.subs)
                  : undefined,
              );
              const keys = keeper
                ? ["div", "han", "kic", "ref", "pos", "spe"]
                : ["pac", "sho", "pas", "dri", "def", "phy"];
              return (
                <div key={String(keeper)}>
                  <h3 style={{ marginTop: 30 }}>
                    {keeper ? "Attributs gardien" : "Attributs de champ"}
                  </h3>
                  {keys.map((key) =>
                    row(
                      key.toUpperCase(),
                      stats[0]?.[key as keyof (typeof stats)[0]],
                      stats[1]?.[key as keyof (typeof stats)[1]],
                    ),
                  )}
                  <details style={{ marginTop: 20 }}>
                    <summary>Sous-attributs</summary>
                    {(keeper ? GK_SUBS : FIELD_SUBS).map((key) =>
                      row(
                        subLabels[key],
                        stats[0]
                          ? selected[0]!.attributes.subs[key]
                          : undefined,
                        stats[1]
                          ? selected[1]!.attributes.subs[key]
                          : undefined,
                      ),
                    )}
                  </details>
                </div>
              );
            })}
            <h3 style={{ marginTop: 30 }}>Notes par poste</h3>
            <label className="pill">
              <input
                type="checkbox"
                checked={fit}
                onChange={(event) => setFit(event.target.checked)}
              />{" "}
              Adéquation estimée
            </label>
            {(fit
              ? POSITIONS
              : ([
                  "GK",
                  "CB",
                  "RB",
                  "CDM",
                  "CM",
                  "CAM",
                  "RM",
                  "RW",
                  "ST",
                ] as const)
            ).map((position) => {
              const values = selected.map((player) => {
                if ((player!.position === "GK") !== (position === "GK"))
                  return undefined;
                const rating = positionRatings(player!).find(
                  (rating) => rating.position === position,
                )!;
                return fit ? rating.adjusted : rating.raw;
              });
              return row(
                fit
                  ? position
                  : position === "RB"
                    ? "LB / RB / LWB / RWB"
                    : position === "RM"
                      ? "LM / RM"
                      : position === "RW"
                        ? "LW / RW"
                        : position === "ST"
                          ? "ST / CF"
                          : position,
                values[0],
                values[1],
              );
            })}
            <h3 style={{ marginTop: 30 }}>
              Entraînement jusqu’au max · coachs et centre niveau 5
            </h3>
            <div className="page-grid">
              {selected.map((player) => {
                const plan = planTraining(player!, {
                  coaches: MAX_COACHES,
                  center: 5,
                });
                return (
                  <div className="notice" key={player!.id}>
                    <strong>{player!.name}</strong>
                    <br />
                    OVR calculé {plan.from ?? "—"} → {plan.to ?? "—"}
                    <br />
                    {plan.sessions} séances · {money(plan.cost)}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="empty">
            <p>
              {remote
                ? "Recherchez deux joueurs dans l’index ou choisissez-les dans votre effectif importé."
                : "Sélectionnez deux joueurs de votre effectif importé pour les comparer."}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
