"use client";

import { useState } from "react";
import { ArrowUpTrayIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { clearSquad, importSquad, useSquad } from "@/lib/local-squad";
import SquadTable from "./SquadTable";
import SquadExport from "./SquadExport";

export default function SquadImport({
  embedded = false,
}: {
  /** Affichée sous « Mon effectif » : sans le grand titre de page. */
  embedded?: boolean;
}) {
  const { players, warnings, error } = useSquad();
  const [json, setJson] = useState(""),
    [busy, setBusy] = useState(false),
    [importError, setImportError] = useState("");
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
  return (
    <>
      {!embedded && (
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
      )}
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
          <SquadExport players={players} />
          <SquadTable
            players={players}
            hrefPrefix="/player/local:"
            action={
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
            }
          />
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
