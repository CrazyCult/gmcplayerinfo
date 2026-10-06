"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 30_000,
  POLL_MAX_MS = 45 * 60_000;
type State = "idle" | "sending" | "waiting" | "error";

/**
 * Fiche légère → complète. Le site ne lit jamais GameChase : il demande aux
 * extensions GMC Companion de lire la fiche du joueur en priorité, ou ouvre
 * cette fiche dans le jeu (l'extension de l'utilisateur la lit alors).
 * Fonctionne aussi pour les agents libres.
 */
export default function LoadFullButton({
  playerId,
  requestedAt,
}: {
  playerId: string;
  requestedAt?: number | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>(requestedAt ? "waiting" : "idle");
  const [message, setMessage] = useState("");
  const [since, setSince] = useState(() => requestedAt ?? 0);
  useEffect(() => {
    if (state !== "waiting") return;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_MAX_MS) {
        clearInterval(timer);
        setState("idle");
        setMessage(
          "Toujours pas lu : aucune extension active pour l’instant. Réessaie plus tard.",
        );
        return;
      }
      try {
        const response = await fetch(
          `/api/player/${encodeURIComponent(playerId)}/status`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (response.ok && data.light === false) {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        /* nouvel essai au prochain intervalle */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [state, playerId, router]);

  async function ask() {
    setState("sending");
    setMessage("");
    try {
      const response = await fetch(
        `/api/player/${encodeURIComponent(playerId)}/request`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) {
        setState("error");
        setMessage(data.error ?? "Demande impossible.");
        return;
      }
      if (data.light === false) return router.refresh();
      setSince(data.requestedAt ?? Date.now());
      setState("waiting");
    } catch {
      setState("error");
      setMessage("Index momentanément indisponible.");
    }
  }
  return (
    <div className="hero-actions" style={{ alignItems: "center" }}>
      <button
        className="button primary"
        type="button"
        onClick={ask}
        disabled={state === "sending" || state === "waiting"}
      >
        {state === "sending"
          ? "Demande…"
          : state === "waiting"
            ? "Lecture demandée"
            : "Charger la fiche complète"}
      </button>
      <a
        className="button"
        href={`https://gamechase.io/gamev2/players/${encodeURIComponent(playerId)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          if (state !== "waiting") {
            setSince(Date.now());
            setState("waiting");
          }
        }}
      >
        Ouvrir sa fiche dans GameChase ↗
      </a>
      <small className="muted" style={{ flexBasis: "100%" }}>
        {state === "waiting"
          ? `Demandé à ${new Date(since).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })} : la première extension GMC Companion active lit la fiche de ce joueur (en général en quelques minutes). Si tu as l’extension, ouvrir sa fiche dans le jeu suffit : quelques secondes. Cette page se met à jour toute seule.`
          : message ||
            "Le site ne lit pas le jeu lui-même : il demande aux extensions GMC Companion de lire la fiche de ce joueur en priorité."}
      </small>
    </div>
  );
}
