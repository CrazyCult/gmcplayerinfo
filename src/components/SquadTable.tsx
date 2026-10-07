"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { compact, money } from "@/lib/format";
import { ovrLevers, planTraining } from "@/engine/planner";
import { positionRatings } from "@/engine/positionFit";
import { projectValue } from "@/engine/value";
import { MAX_COACHES } from "@/engine/tables";
import { coachSummary, useClubSettings } from "@/lib/trainingSettings";
import ClubSettingsForm from "./ClubSettingsForm";
import Fold from "./UI/Fold";
import { POSITIONS, type Player } from "@/types";
import Rating from "./UI/Rating";

type SortKey =
  | "name"
  | "position"
  | "age"
  | "overall"
  | "potential"
  | "gap"
  | "sessions"
  | "cost"
  | "fitness"
  | "posGain"
  | "plusOneCost"
  | "plusOneNet";

/** Tableau d’effectif : notes, écart au potentiel et plan d’entraînement. */
export default function SquadTable({
  players,
  hrefPrefix,
  lightIds,
  subtitle,
  action,
  premium = false,
}: {
  players: Player[];
  /** Début du lien vers la fiche (« /player/ » ou « /player/local: »). */
  hrefPrefix: string;
  lightIds?: string[];
  subtitle?: string;
  action?: ReactNode;
  /** Modules réservés : meilleur poste, +1 OVR le moins cher, revente. */
  premium?: boolean;
}) {
  const light = useMemo(() => new Set(lightIds), [lightIds]);
  // Réglages du club s’ils sont enregistrés, sinon tout au niveau 5.
  const club = useClubSettings();
  const options = useMemo(
    () =>
      club.saved
        ? { coaches: club.coaches, center: club.center }
        : { coaches: MAX_COACHES, center: 5 },
    [club],
  );
  const settingsLabel = club.saved
    ? coachSummary(club)
    : "tous les coachs et le centre au niveau 5";
  const [filter, setFilter] = useState(""),
    [position, setPosition] = useState(""),
    [age, setAge] = useState("");
  const [sort, setSort] = useState<SortKey>("gap"),
    [direction, setDirection] = useState(-1);
  const rows = useMemo(
    () =>
      players.map((player) => {
        // Fiche légère : pas de sous-attributs, donc pas de plan fiable.
        const plan = light.has(player.id)
          ? null
          : planTraining(player, options);
        const ok = plan && !plan.incomplete;
        // Réservé : gain d’OVR en changeant de poste (carte de poste) et
        // +1 OVR le moins cher (coachs niveau 5), avec la plus-value estimée.
        let posGain: number | undefined,
          posBest: string | undefined,
          plusOneCost: number | undefined,
          plusOneSessions: number | undefined,
          plusOneNet: number | undefined;
        if (premium) {
          const table = positionRatings(player).filter((r) =>
            player.position === "GK"
              ? r.position === "GK"
              : r.position !== "GK",
          );
          const own = table.find((r) => r.position === player.position)?.raw;
          const best = table.reduce<(typeof table)[number] | undefined>(
            (top, r) =>
              r.raw !== undefined && (top?.raw === undefined || r.raw > top.raw)
                ? r
                : top,
            undefined,
          );
          if (own !== undefined && best?.raw !== undefined) {
            posGain = best.raw - own;
            posBest = posGain > 0 ? best.position : undefined;
          }
          if (!light.has(player.id)) {
            const cheapest = ovrLevers(player, options)
              .filter((l) => l.progresses)
              .sort((a, b) => a.cost - b.cost)[0];
            if (cheapest) {
              plusOneCost = cheapest.cost;
              plusOneSessions = cheapest.sessions;
              if (player.value)
                plusOneNet =
                  projectValue(
                    player.value,
                    player.overall,
                    player.overall + 1,
                  ) -
                  player.value -
                  cheapest.cost;
            }
          }
        }
        return {
          ...player,
          posGain,
          posBest,
          plusOneCost,
          plusOneSessions,
          plusOneNet,
          gap: player.potential - player.overall,
          sessions: ok ? plan.sessions : undefined,
          cost: ok ? plan.cost : undefined,
          fitness: ok ? plan.fitness : undefined,
          to: plan?.to,
        };
      }),
    [players, light, premium, options],
  );
  const filtered = rows
    .filter(
      (player) =>
        player.name.toLowerCase().includes(filter.toLowerCase()) &&
        (!position || player.position === position) &&
        (!age || player.age <= Number(age)),
    )
    .sort((a, b) => {
      const av = a[sort],
        bv = b[sort];
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return (
        (typeof av === "string" && typeof bv === "string"
          ? av.localeCompare(bv)
          : Number(av) - Number(bv)) * direction
      );
    });
  function order(key: SortKey) {
    if (sort === key) setDirection(-direction);
    else {
      setSort(key);
      setDirection(
        key === "name" || key === "position" || key === "plusOneCost" ? 1 : -1,
      );
    }
  }
  const headers: [SortKey, string][] = [
    ["position", "Poste"],
    ["name", "Joueur"],
    ["age", "Âge"],
    ["overall", "OVR"],
    ["potential", "POT"],
    ["gap", "Écart"],
    ["sessions", "Séances → max"],
    ["cost", "Coût → max"],
    ["fitness", "Forme"],
    ...(premium
      ? ([
          ["posGain", "★ Poste +"],
          ["plusOneCost", "★ +1 OVR le moins cher"],
          ["plusOneNet", "★ Revente +1"],
        ] as [SortKey, string][])
      : []),
  ];
  return (
    <>
      <div className="statline">
        <div>
          <strong>{players.length}</strong>
          <small>Joueurs</small>
        </div>
        <div>
          <strong>
            {Math.round(
              players.reduce((sum, p) => sum + p.overall, 0) / players.length,
            )}
          </strong>
          <small>OVR moyen</small>
        </div>
        <div>
          <strong>
            {Math.round(
              players.reduce((sum, p) => sum + p.age, 0) / players.length,
            )}
          </strong>
          <small>Âge moyen</small>
        </div>
        <div>
          <strong>
            {compact(rows.reduce((sum, p) => sum + (p.cost ?? 0), 0))}
          </strong>
          <small>GMC2 → max</small>
        </div>
      </div>
      <section className="card">
        <div className="section-head">
          <div>
            <h2 style={{ margin: 0 }}>
              Les joueurs <small>({filtered.length})</small>
            </h2>
            <p>{subtitle ?? `Plans calculés avec ${settingsLabel}.`}</p>
          </div>
          {action}
        </div>
        <Fold
          title="Réglages de mon club"
          summary={
            club.saved
              ? settingsLabel
              : "À renseigner pour des coûts identiques au jeu"
          }
        >
          <p className="muted" style={{ marginTop: 0 }}>
            Niveaux de tes coachs et de ton centre d’entraînement (menu
            Entraînement du jeu). Mémorisés dans ce navigateur, repris par le
            simulateur et les leviers d’OVR.
          </p>
          <ClubSettingsForm />
        </Fold>
        <div className="filters">
          <input
            placeholder="Filtrer par nom…"
            aria-label="Filtrer par nom"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <select
            aria-label="Filtrer par poste"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
          >
            <option value="">Tous les postes</option>
            {POSITIONS.map((post) => (
              <option key={post}>{post}</option>
            ))}
          </select>
          <select
            aria-label="Âge maximum"
            value={age}
            onChange={(event) => setAge(event.target.value)}
          >
            <option value="">Tous les âges</option>
            <option value="17">17 ans et moins</option>
            <option value="24">24 ans et moins</option>
            <option value="30">30 ans et moins</option>
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {headers.map(([key, label]) => (
                  <th
                    key={key}
                    aria-sort={
                      sort === key
                        ? direction === 1
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button onClick={() => order(key)}>
                      {label}{" "}
                      {sort === key ? (direction === 1 ? "↑" : "↓") : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((player) => (
                <tr key={player.id}>
                  <td>
                    <span className="pill">{player.position}</span>
                  </td>
                  <td>
                    <Link href={`${hrefPrefix}${player.id}`} prefetch={false}>
                      {player.name}
                    </Link>
                    {light.has(player.id) && (
                      <small
                        className="muted"
                        title="Fiche légère : 6 stats seulement, plan indisponible"
                      >
                        {" "}
                        · légère
                      </small>
                    )}
                  </td>
                  <td>{player.age}</td>
                  <td>
                    <Rating value={player.overall} />
                  </td>
                  <td>
                    <Rating value={player.potential} />
                  </td>
                  <td className="link-accent">+{player.gap}</td>
                  <td>
                    {player.sessions ?? "—"} <small>→ {player.to ?? "—"}</small>
                  </td>
                  <td
                    title={
                      player.cost === undefined ? undefined : money(player.cost)
                    }
                  >
                    {player.cost === undefined ? "—" : compact(player.cost)}
                  </td>
                  <td>{player.fitness ?? "—"}</td>
                  {premium && (
                    <>
                      <td>
                        {player.posGain && player.posGain > 0 ? (
                          <strong style={{ color: "var(--attr-good)" }}>
                            {player.posBest} +{player.posGain}
                          </strong>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        title={
                          player.plusOneCost === undefined
                            ? undefined
                            : money(player.plusOneCost)
                        }
                      >
                        {player.plusOneCost === undefined
                          ? "—"
                          : `${compact(player.plusOneCost)} · ${player.plusOneSessions} séance${(player.plusOneSessions ?? 0) > 1 ? "s" : ""}`}
                      </td>
                      <td
                        style={{
                          color:
                            player.plusOneNet === undefined
                              ? undefined
                              : player.plusOneNet >= 0
                                ? "var(--attr-good)"
                                : "var(--attr-bad)",
                          fontWeight: 700,
                        }}
                        title="Valeur estimée à +1 OVR − valeur actuelle − coût de l’entraînement"
                      >
                        {player.plusOneNet === undefined
                          ? "—"
                          : `${player.plusOneNet >= 0 ? "+" : "−"}${compact(Math.abs(player.plusOneNet))}`}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
