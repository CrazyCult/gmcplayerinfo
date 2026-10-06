"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpTrayIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { clearSquad, importSquad, useSquad } from "@/lib/local-squad";
import { compact, money } from "@/lib/format";
import { planTraining } from "@/engine/planner";
import { MAX_COACHES } from "@/engine/tables";
import { POSITIONS } from "@/types";
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
export default function SquadImport() {
  const { players, warnings, error } = useSquad();
  const [json, setJson] = useState(""),
    [busy, setBusy] = useState(false),
    [importError, setImportError] = useState("");
  const [filter, setFilter] = useState(""),
    [position, setPosition] = useState(""),
    [age, setAge] = useState("");
  const [sort, setSort] = useState<SortKey>("gap"),
    [direction, setDirection] = useState(-1);
  const rows = useMemo(
    () =>
      players.map((player) => {
        const plan = planTraining(player, { coaches: MAX_COACHES, center: 5 });
        return {
          ...player,
          gap: player.potential - player.overall,
          sessions: plan.incomplete ? undefined : plan.sessions,
          cost: plan.incomplete ? undefined : plan.cost,
          fitness: plan.incomplete ? undefined : plan.fitness,
          to: plan.to,
        };
      }),
    [players],
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
  async function load(source: string) {
    setBusy(true);
    setImportError("");
    try {
      const result = await importSquad(JSON.parse(source));
      toast.success(`${result.players.length} joueurs importés`);
      setJson("");
    } catch (caught) {
      setImportError(
        caught instanceof SyntaxError
          ? "JSON invalide. Vérifiez le contenu du fichier."
          : caught instanceof Error
            ? caught.message
            : "Import impossible.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function readFile(file?: File) {
    if (file) {
      if (file.size > 25 * 1024 * 1024) {
        setImportError("Fichier trop volumineux (25 Mo maximum).");
        return;
      }
      await load(await file.text());
    }
  }
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
      <div className="section-head">
        <div>
          <div className="eyebrow">Votre vestiaire</div>
          <h1>Mon effectif</h1>
          <p>Importez, analysez et préparez la progression de vos joueurs.</p>
        </div>
        <span className="status">
          <ShieldCheckIcon width={16} />
          Stockage local uniquement
        </span>
      </div>
      <div className="page-grid">
        <section className="card">
          <h2>Déposer un fichier</h2>
          <div
            className="dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void readFile(event.dataTransfer.files[0]);
            }}
          >
            <ArrowUpTrayIcon />
            <div>
              Glissez votre export JSON ici
              <br />
              <small>Tableau de joueurs ou réponse d’effectif GameChase</small>
            </div>
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Choisir un export JSON"
              disabled={busy}
              onChange={(event) => {
                void readFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </section>
        <section className="card">
          <h2>Ou coller le JSON</h2>
          <textarea
            aria-label="JSON de l’effectif"
            placeholder={'[ { "id": "…", "name": "…", … } ]'}
            value={json}
            onChange={(event) => setJson(event.target.value)}
          />
          <div className="import-actions">
            <small>Rien n’est envoyé au serveur.</small>
            <button
              className="button primary"
              disabled={busy || !json.trim()}
              onClick={() => void load(json)}
            >
              {busy ? "Import en cours…" : "Importer les joueurs"}
            </button>
          </div>
        </section>
      </div>
      {(importError || error) && (
        <div
          className="notice warning"
          role="alert"
          style={{ whiteSpace: "pre-wrap" }}
        >
          {importError || error}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="notice warning">
          {warnings.map((warning) => (
            <div key={warning.id}>{warning.message}</div>
          ))}
        </div>
      )}
      {players.length > 0 ? (
        <>
          <div className="statline">
            <div>
              <strong>{players.length}</strong>
              <small>Joueurs importés</small>
            </div>
            <div>
              <strong>
                {Math.round(
                  players.reduce((sum, p) => sum + p.overall, 0) /
                    players.length,
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
                <p>Plans avec tous les coachs et le centre au niveau 5.</p>
              </div>
              <button
                className="button subtle"
                onClick={() => {
                  void clearSquad().catch(() =>
                    toast.error("Suppression impossible."),
                  );
                }}
              >
                Effacer l’import
              </button>
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
                        <Link href={`/player/local:${player.id}`}>
                          {player.name}
                        </Link>
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
                        {player.sessions ?? "—"}{" "}
                        <small>→ {player.to ?? "—"}</small>
                      </td>
                      <td
                        title={
                          player.cost === undefined
                            ? undefined
                            : money(player.cost)
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
      ) : (
        <div className="empty">
          <h2>Votre analyse commence ici.</h2>
          <p>
            Importez un effectif pour afficher les notes et les plans
            d’entraînement.
          </p>
        </div>
      )}
    </>
  );
}
