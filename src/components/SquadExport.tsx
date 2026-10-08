"use client";
import { useEffect, useState } from "react";
import { get, set, del } from "idb-keyval";
import { requestCompanionSquad } from "@/lib/companion-sync";
import type { Player } from "@/types";
import {
  parseSquadExport,
  squadCsv,
  type SquadExportData,
} from "@/lib/squad-export";
export default function SquadExport({
  players,
  collectedAt,
  clubName,
  scope = "local",
}: {
  players: Player[];
  collectedAt?: number;
  clubName?: string;
  scope?: string;
}) {
  const [imported, setImported] = useState<SquadExportData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const storageKey = `gmc-tactical-export:${scope}`;
  useEffect(() => {
    let active = true;
    void get(storageKey)
      .then((raw) => {
        if (active && raw) {
          const parsed = parseSquadExport(raw);
          setImported(parsed);
          setMessage("Export tactique enregistré retrouvé dans ce navigateur.");
        }
      })
      .catch(() => {
        if (active)
          setError(
            "L’export enregistré est inaccessible. Réimporte le fichier.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [storageKey]);
  async function saveSnapshot(parsed: SquadExportData, success: string) {
    setImported(parsed);
    try {
      await set(storageKey, parsed);
      setMessage(`${success} Enregistré dans ce navigateur.`);
    } catch {
      setMessage(`${success} Conservation indisponible après rechargement.`);
    }
  }
  async function refreshFromCompanion() {
    setBusy(true);
    setSyncing(true);
    setError("");
    setMessage("");
    try {
      const snapshot = parseSquadExport(await requestCompanionSquad());
      await saveSnapshot(
        snapshot,
        "Effectif actualisé depuis GameChase : XI, banc et attributs chargés.",
      );
    } catch (e) {
      setError(
        e instanceof Error && !e.message.startsWith("[")
          ? e.message
          : "Les données reçues sont incomplètes. Termine ta composition dans le jeu puis réessaie.",
      );
    } finally {
      setBusy(false);
      setSyncing(false);
    }
  }
  async function readFile(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Fichier trop volumineux (5 Mo maximum).");
      const parsed = parseSquadExport(
        JSON.parse((await file.text()).replace(/^\uFEFF/, "")),
      );
      await saveSnapshot(parsed, `Import réussi : ${file.name}.`);
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "Ce fichier ne contient pas du JSON valide."
          : e instanceof Error && !e.message.startsWith("[")
            ? e.message
            : "Export invalide ou incomplet : utilise le JSON « effectif-tactique » de GMC Companion.",
      );
    } finally {
      setBusy(false);
    }
  }
  function download(format: "csv" | "json") {
    const data: SquadExportData = imported ?? {
      version: 2,
      source: "gmc-player-info",
      collectedAt: collectedAt ? new Date(collectedAt).toISOString() : null,
      tactics: null,
      players,
    };
    const payload = {
      ...data,
      exportedAt: new Date().toISOString(),
      ...(imported ? {} : { clubName }),
    };
    const url = URL.createObjectURL(
      new Blob(
        [format === "csv" ? squadCsv(data) : JSON.stringify(payload, null, 2)],
        {
          type:
            format === "csv" ? "text/csv;charset=utf-8" : "application/json",
        },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `effectif-tactique-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return (
    <section className="card" style={{ marginBlock: 24 }}>
      <h2>Exporter pour préparer ma tactique</h2>
      <p>
        {imported
          ? `${imported.players.length} joueurs chargés · ${imported.collectedAt ? "données lues le " + new Date(imported.collectedAt).toLocaleString("fr-FR") : "date de lecture inconnue"}.`
          : `${players.length} joueurs de ${clubName || "cet effectif"}. Actualise depuis l’extension pour récupérer ton XI, ton banc et tes consignes.`}
      </p>
      <button
        className="button primary"
        disabled={busy}
        onClick={() => void refreshFromCompanion()}
      >
        {syncing
          ? "Actualisation en cours…"
          : "Actualiser depuis GMC Companion"}
      </button>
      <p className="muted">
        Garde GameChase ouvert et connecté dans ce navigateur. Chaque clic relit
        ton effectif et ta composition actuels, avec GMC Companion 2.38.7 et son
        module Explorateur activé. Les données chargées sont affichées
        ci-dessous et utilisées pour les exports.
      </p>
      <p className="muted">
        Attributs et sous-attributs, matchs joués, buts et passes décisives
        lorsqu’ils sont disponibles. Cellule vide = donnée absente. CSV : une
        ligne par joueur ; JSON : joueurs et tactique complète disponible.
      </p>
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBlock: 16 }}
      >
        <button
          className="button primary"
          disabled={busy || (!imported && !players.length)}
          onClick={() => download("csv")}
        >
          Exporter CSV
        </button>
        <button
          className="button"
          disabled={busy || (!imported && !players.length)}
          onClick={() => download("json")}
        >
          Exporter JSON
        </button>
        {imported && (
          <button
            className="button subtle"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await del(storageKey);
                setImported(null);
                setError("");
                setMessage(
                  "Retour aux données du site. Import tactique local retiré.",
                );
              } catch {
                setError("Impossible de retirer l’import enregistré.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Revenir à l’effectif du site
          </button>
        )}
      </div>
      <label style={{ display: "grid", gap: 8, marginBlock: 16 }}>
        Ajouter la composition du jeu (JSON de GMC Companion)
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Importer un export tactique JSON"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void readFile(file);
          }}
        />
      </label>
      <small className="muted" style={{ display: "block" }}>
        Import de fichier en secours : dans le jeu, Explorateur → Export
        tactique JSON. Les données sont conservées dans ce navigateur. Pour
        prendre en compte tes derniers changements dans le jeu, clique sur
        Actualiser.
      </small>
      {(busy || message) && (
        <p role="status" className="notice">
          {busy
            ? syncing
              ? "Lecture de ton effectif et de ta composition dans GameChase…"
              : "Lecture de l’export tactique…"
            : message}
        </p>
      )}
      {imported && (
        <div className="notice">
          <strong>{imported.players.length} joueurs prêts à exporter</strong>
          <p>
            {imported.tactics
              ? `${imported.tactics.lineup.filter((s) => s.playerId).length} titulaires · ${imported.tactics.substitutes.filter((s) => s.playerId).length} remplaçants · formation ${String(imported.tactics.formation || "non renseignée")}`
              : "Composition absente dans ce fichier."}
          </p>
          {imported.tactics && (
            <details>
              <summary>Voir le XI et le banc chargés</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Groupe</th>
                      <th>Joueur</th>
                      <th>Poste</th>
                      <th>Rôle</th>
                      <th>Matchs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...imported.tactics.lineup.map((s) => ({
                        ...s,
                        group: "XI",
                      })),
                      ...imported.tactics.substitutes.map((s) => ({
                        ...s,
                        group: "Banc",
                      })),
                    ].map((s, i) => {
                      const player = imported.players.find(
                        (p) => p.id === s.playerId,
                      );
                      return (
                        <tr key={i}>
                          <td>{s.group}</td>
                          <td>{player?.name || "Poste vide"}</td>
                          <td>{s.position || player?.position || "—"}</td>
                          <td>{s.role || "—"}</td>
                          <td>{player?.matchesPlayed ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="notice warning">
          {error}
        </p>
      )}
    </section>
  );
}
