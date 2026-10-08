"use client";
import { useEffect, useState } from "react";
import {
  APPEARANCES,
  APPEARANCE_LABELS,
  isAppearance,
  type Appearance,
} from "@/lib/appearance";
import { applyAppearance, currentAppearance } from "@/lib/appearance-store";

export default function AccountAppearance() {
  const [choice, setChoice] = useState<Appearance>("dark");
  const [saved, setSaved] = useState<Appearance | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/preferences/appearance", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (controller.signal.aborted) return;
        setSaved(isAppearance(data.appearance) ? data.appearance : null);
        setChoice(
          isAppearance(data.appearance) ? data.appearance : currentAppearance(),
        );
      } catch {
        if (!controller.signal.aborted) {
          setChoice(currentAppearance());
          setMessage("Préférence du compte indisponible. Tu peux réessayer.");
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  async function save(appearance: Appearance | null) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/preferences/appearance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appearance }),
      });
      if (!response.ok) throw new Error();
      setSaved(appearance);
      if (appearance) applyAppearance(appearance);
      setMessage(
        appearance
          ? "Apparence de référence enregistrée sur ton compte."
          : "Préférence du compte supprimée. Le choix de ce navigateur est conservé.",
      );
    } catch {
      setMessage(
        "Sauvegarde impossible. Le choix de ce navigateur est conservé.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="appearance-settings" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Apparence de référence</h2>
      <p className="muted">
        Retrouve cette apparence sur les autres navigateurs après connexion à
        ton compte Google. Changer le skin dans l’en-tête reste un choix local.
      </p>
      <fieldset disabled={busy}>
        <legend>Choisir l’apparence à enregistrer</legend>
        <div className="appearance-options">
          {APPEARANCES.map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="account-appearance"
                value={value}
                checked={choice === value}
                onChange={() => setChoice(value)}
              />
              {APPEARANCE_LABELS[value]}
            </label>
          ))}
        </div>
        <div className="appearance-save-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => void save(choice)}
          >
            Enregistrer sur mon compte
          </button>
          {saved && (
            <button
              type="button"
              className="button"
              onClick={() => void save(null)}
            >
              Utiliser seulement le choix local
            </button>
          )}
        </div>
      </fieldset>
      <p role="status" aria-live="polite" className="muted">
        {busy
          ? "Chargement…"
          : message ||
            (saved
              ? `Référence enregistrée : ${APPEARANCE_LABELS[saved]}.`
              : "Aucune apparence enregistrée sur ce compte.")}
      </p>
    </section>
  );
}
