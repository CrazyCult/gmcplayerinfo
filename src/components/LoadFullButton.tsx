"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 5_000,
  POLL_MAX_MS = 45 * 60_000;
type State = "checking" | "idle" | "sending" | "waiting" | "error";

/**
 * Fiche légère → complète. Le site ne lit jamais GameChase : il demande aux
 * extensions GMC Companion de lire la fiche du joueur en priorité, ou ouvre
 * cette fiche dans le jeu (l'extension de l'utilisateur la lit alors).
 * Fonctionne aussi pour les agents libres.
 */
export default function LoadFullButton({
  playerId,
  requestedAt,
  label = "Charger la fiche complète",
}: {
  playerId: string;
  requestedAt?: number | null;
  label?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<State>(
    requestedAt === undefined ? "checking" : requestedAt ? "waiting" : "idle",
  );
  const [message, setMessage] = useState("");
  const [since, setSince] = useState(() => requestedAt ?? 0);
  useEffect(() => {
    if (state !== "checking") return;
    const controller = new AbortController();
    async function check() {
      try {
        const response = await fetch(
          `/api/player/${encodeURIComponent(playerId)}/status`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error("Status unavailable");
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (data.light === false) {
          setState("idle");
          router.refresh();
        } else if (
          typeof data.requestedAt === "number" &&
          data.requestedAt > 0
        ) {
          setSince(data.requestedAt);
          setState("waiting");
        } else {
          setState("idle");
        }
      } catch {
        if (!controller.signal.aborted) setState("idle");
      }
    }
    void check();
    return () => controller.abort();
  }, [state, playerId, router]);
  useEffect(() => {
    if (state !== "waiting") return;
    const started = Date.now();
    let reading = false,
      skip = 0;
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_MAX_MS) {
        clearInterval(timer);
        setState("idle");
        setMessage("Toujours pas lue. Réessaie plus tard.");
        return;
      }
      if (reading || document.hidden) return;
      // Toutes les 5 s les 2 premières minutes, puis toutes les 20 s.
      if (Date.now() - started > 120_000 && ++skip % 4) return;
      reading = true;
      try {
        const response = await fetch(
          `/api/player/${encodeURIComponent(playerId)}/status`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (response.ok && data.light === false) {
          clearInterval(timer);
          router.refresh();
        } else if (response.status === 404) {
          // Demande retirée : le jeu ne connaît pas cet identifiant.
          clearInterval(timer);
          setState("error");
          setMessage(
            "Le jeu ne connaît pas ce joueur : vérifie l’identifiant (celui de la fiche du joueur, pas celui du club).",
          );
        }
      } catch {
        /* nouvel essai au prochain intervalle */
      } finally {
        reading = false;
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
        disabled={
          state === "checking" || state === "sending" || state === "waiting"
        }
      >
        {state === "checking"
          ? "Vérification de la demande…"
          : state === "sending"
            ? "Demande…"
            : state === "waiting"
              ? "Lecture demandée"
              : label}
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
          ? `Demandé à ${new Date(since).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })} : le serveur lit la fiche de ce joueur en priorité (en général dans la minute). Si tu as l’extension, ouvrir sa fiche dans le jeu suffit aussi. Cette page se met à jour toute seule.`
          : message ||
            "Demande la lecture de la fiche complète de ce joueur : elle passe avant tout le reste, en général dans la minute."}
      </small>
    </div>
  );
}
