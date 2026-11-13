"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestClubUpdate } from "@/app/squad/actions";

export default function SquadUpdateButton({
  teamId,
  requestedAt,
  title,
  primary = false,
  children,
}: {
  teamId: string;
  requestedAt: number | null;
  /** Texte de gauche (à qui est ce club). */
  title: React.ReactNode;
  /** Bouton principal de la barre. */
  primary?: boolean;
  /** Autres actions, placées avant le bouton de mise à jour. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [since, setSince] = useState(requestedAt);
  // Demande qui traîne (plus de 2 min) : on peut la relancer, ce qui réveille
  // tout de suite le compte lecteur du serveur.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [since]);
  const [relaunched, setRelaunched] = useState(0);
  const stale =
    Boolean(since) && now - Math.max(since ?? 0, relaunched) > 120_000;
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!since) return;
    const controller = new AbortController();
    const started = Date.now();
    let reading = false,
      skip = 0;
    const timer = setInterval(async () => {
      if (Date.now() - started > 45 * 60_000) {
        clearInterval(timer);
        setSince(null);
        setMessage("L’effectif n’a pas encore été relu. Réessaie plus tard.");
        return;
      }
      if (reading || document.hidden) return;
      // Toutes les 5 s les 2 premières minutes, puis toutes les 20 s.
      if (Date.now() - started > 120_000 && ++skip % 4) return;
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
    }, 5_000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [since, teamId, router]);
  async function ask() {
    if (sending || (since && !stale)) return;
    setSending(true);
    setMessage("");
    try {
      const result = await requestClubUpdate(teamId);
      if (result.ok) {
        setSince(result.requestedAt);
        setRelaunched(Date.now());
        setNow(Date.now());
        router.refresh();
      } else setMessage(result.error);
    } catch {
      setMessage("Demande impossible pour l’instant. Réessaie plus tard.");
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="action-bar">
      <div className="action-bar-title">{title}</div>
      <small className="action-bar-status" role="status">
        {message ||
          (since && stale
            ? "Toujours en attente : tu peux relancer la demande."
            : since
              ? "Demande envoyée : l’effectif est relu en priorité (en général dans la minute) et s’affichera ici tout seul."
              : "Relit tout l’effectif du club en priorité, même sans extension.")}
      </small>
      <div className="action-bar-actions">
        {children}
        <button
          className={primary ? "button primary" : "button"}
          disabled={sending || (Boolean(since) && !stale)}
          onClick={() => void ask()}
        >
          {sending
            ? "Demande en cours…"
            : since
              ? stale
                ? "Relancer la mise à jour"
                : "Mise à jour demandée"
              : "Demander la mise à jour de l’effectif"}
        </button>
      </div>
    </div>
  );
}
