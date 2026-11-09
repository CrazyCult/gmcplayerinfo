"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 20_000,
  POLL_MAX_MS = 30 * 60_000;
const time = (t: number) =>
  new Date(t).toLocaleTimeString("fr-CH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  });

/**
 * Fiche complète → relecture. Le site ne lit jamais GameChase : la demande
 * passe en tête de ce que lit le compte lecteur du serveur (et les extensions
 * GMC Companion actives), en général dans la minute.
 */
export default function RefreshPlayerButton({
  playerId,
  fetchedAt,
}: {
  playerId: string;
  fetchedAt: number;
}) {
  const router = useRouter();
  const [since, setSince] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  // Demande déjà en cours (autre onglet, autre utilisateur) ?
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/player/${encodeURIComponent(playerId)}/status`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.requestedAt === "number" && d.requestedAt > 0)
          setSince(d.requestedAt);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [playerId]);
  useEffect(() => {
    if (!since) return;
    const started = Date.now();
    let reading = false;
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_MAX_MS) {
        clearInterval(timer);
        setSince(null);
        setMessage("Pas encore relue. Réessaie plus tard.");
        return;
      }
      if (reading || document.hidden) return;
      reading = true;
      try {
        const response = await fetch(
          `/api/player/${encodeURIComponent(playerId)}/status`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (
          response.ok &&
          typeof data.fetchedAt === "number" &&
          data.fetchedAt >= since
        ) {
          clearInterval(timer);
          setSince(null);
          setMessage("Fiche mise à jour.");
          router.refresh();
        }
      } catch {
        /* nouvel essai au prochain intervalle */
      } finally {
        reading = false;
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [since, playerId, router]);

  async function ask() {
    if (sending || since) return;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/player/${encodeURIComponent(playerId)}/request`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) setMessage(data.error ?? "Demande impossible.");
      else if (data.status === "recent")
        setMessage("Fiche lue il y a moins de 10 minutes : déjà à jour.");
      else if (typeof data.requestedAt === "number") setSince(data.requestedAt);
    } catch {
      setMessage("Index momentanément indisponible.");
    } finally {
      setSending(false);
    }
  }
  return (
    <span
      style={{
        display: "inline-flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <button
        className="button"
        type="button"
        onClick={() => void ask()}
        disabled={sending || Boolean(since)}
      >
        {sending
          ? "Demande…"
          : since
            ? "Mise à jour demandée"
            : "Mettre à jour la fiche"}
      </button>
      <small className="muted" role="status">
        {since
          ? `Demandé à ${time(since)} : relue en général dans la minute, la page se met à jour toute seule.`
          : message || `Lue à ${time(fetchedAt)}.`}
      </small>
    </span>
  );
}
