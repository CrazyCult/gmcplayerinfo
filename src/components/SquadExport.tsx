"use client";
import { useState } from "react";
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
}: {
  players: Player[];
  collectedAt?: number;
  clubName?: string;
}) {
  const [imported, setImported] = useState<SquadExportData | null>(null);
  const [error, setError] = useState("");
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
          ? `${imported.players.length} joueurs de l’export importé · ${imported.collectedAt ? "données lues le " + new Date(imported.collectedAt).toLocaleString("fr-FR") : "date de lecture inconnue"}.`
          : `${players.length} joueurs de ${clubName || "cet effectif"}. Pour ajouter le XI, le banc et les consignes, importe l’export JSON de l’extension ci-dessous.`}
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
          disabled={!imported && !players.length}
          onClick={() => download("csv")}
        >
          Exporter CSV
        </button>
        <button
          className="button"
          disabled={!imported && !players.length}
          onClick={() => download("json")}
        >
          Exporter JSON
        </button>
        {imported && (
          <button
            className="button subtle"
            onClick={() => {
              setImported(null);
              setError("");
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
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              if (file.size > 5 * 1024 * 1024)
                throw new Error("Fichier trop volumineux (5 Mo maximum).");
              const parsed = parseSquadExport(JSON.parse(await file.text()));
              setImported(parsed);
              setError("");
            } catch {
              setError(
                "Export invalide ou incomplet : utilise le JSON « effectif-tactique » de GMC Companion.",
              );
            }
          }}
        />
      </label>
      <small className="muted" style={{ display: "block" }}>
        Dans le jeu : Explorateur → Export tactique JSON. L’import reste ici et
        n’est pas envoyé au serveur. Il remplace les données exportées
        ci-dessus, sans fusionner deux clubs.
      </small>
      {error && (
        <p role="alert" className="notice warning">
          {error}
        </p>
      )}
    </section>
  );
}
