"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestClubUpdate } from "@/app/squad/actions";

export default function SquadUpdateButton({
  teamId,
  requestedAt,
}: {
  teamId: string;
  requestedAt: number | null;
}) {
  const router = useRouter();
  const [since, setSince] = useState(requestedAt);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!since) return;
    const controller = new AbortController();
    const started = Date.now();
    let reading = false;
    const timer = setInterval(async () => {
      if (Date.now() - started > 45 * 60_000) {
        clearInterval(timer);
        setSince(null);
        setMessage("L’effectif n’a pas encore été relu. Réessaie plus tard.");
        return;
      }
      if (reading || document.hidden) return;
      reading = true;
      try {
        const response = await fetch(
          `/api/squad/${encodeURIComponent(teamId)}/status`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json();
        if (
          !controller.signal.aborted &&
          response.ok &&
          typeof data.fetchedAt === "number" &&
          data.fetchedAt >= since
        ) {
          clearInterval(timer);
          setSince(null);
          setMessage("Effectif mis à jour.");
          router.refresh();
        }
      } catch {
        /* Next scheduled check, never a second update request. */
      } finally {
        reading = false;
      }
    }, 30_000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [since, teamId, router]);
  async function ask() {
    if (sending || since) return;
    setSending(true);
    setMessage("");
    try {
      const result = await requestClubUpdate(teamId);
      if (result.ok) {
        setSince(result.requestedAt);
        router.refresh();
      } else setMessage(result.error);
    } catch {
      setMessage("Demande impossible pour l’instant. Réessaie plus tard.");
    } finally {
      setSending(false);
    }
  }
  return (
    <div>
      <button
        className="button"
        disabled={sending || Boolean(since)}
        onClick={() => void ask()}
      >
        {sending
          ? "Demande en cours…"
          : since
            ? "Mise à jour demandée"
            : "Demander la mise à jour de l’effectif"}
      </button>
      <small
        className="muted"
        style={{ display: "block", marginTop: 8 }}
        role="status"
      >
        {message ||
          (since
            ? "Demande envoyée aux GMC Companion actifs. L’effectif s’affichera ici après sa lecture ; le délai dépend des extensions disponibles."
            : "Sans extension sur cet appareil : demande une lecture de tout le club aux GMC Companion actifs.")}
      </small>
    </div>
  );
}
