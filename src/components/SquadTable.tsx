"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { compact, money } from "@/lib/format";
import { planTraining } from "@/engine/planner";
import { MAX_COACHES } from "@/engine/tables";
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
  | "fitness";

/** Tableau d’effectif : notes, écart au potentiel et plan d’entraînement. */
export default function SquadTable({
  players,
  hrefPrefix,
  lightIds,
  subtitle = "Plans avec tous les coachs et le centre au niveau 5.",
  action,
}: {
  players: Player[];
  /** Début du lien vers la fiche (« /player/ » ou « /player/local: »). */
  hrefPrefix: string;
  lightIds?: string[];
  subtitle?: string;
  action?: ReactNode;
}) {
  const light = useMemo(() => new Set(lightIds), [lightIds]);
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
          : planTraining(player, { coaches: MAX_COACHES, center: 5 });
        const ok = plan && !plan.incomplete;
        return {
          ...player,
          gap: player.potential - player.overall,
          sessions: ok ? plan.sessions : undefined,
          cost: ok ? plan.cost : undefined,
          fitness: ok ? plan.fitness : undefined,
          to: plan?.to,
        };
      }),
    [players, light],
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
      setDirection(key === "name" || key === "position" ? 1 : -1);
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
          <small>GMC2 → max · coachs 5</small>
        </div>
      </div>
      <section className="card">
        <div className="section-head">
          <div>
            <h2 style={{ margin: 0 }}>
              Les joueurs <small>({filtered.length})</small>
            </h2>
            <p>{subtitle}</p>
          </div>
          {action}
        </div>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
