"use client";

import { useEffect } from "react";
import type { CoachLevels } from "@/engine/tables";
import { saveClubSettings, useClubSettings } from "@/lib/trainingSettings";

/**
 * Club rattaché au compte : les niveaux des coachs et du centre lus dans le jeu
 * par l’extension remplacent la saisie à la main (une fois par lecture du jeu,
 * pour qu’un réglage changé ici ensuite ne soit pas écrasé à chaque visite).
 */
export default function GameSettingsSync({
  coaches,
  center,
  updatedAt,
}: {
  coaches: CoachLevels;
  center: number;
  updatedAt: number;
}) {
  const club = useClubSettings();
  const same =
    club.saved &&
    club.center === center &&
    (Object.keys(coaches) as (keyof CoachLevels)[]).every(
      (key) => club.coaches[key] === coaches[key],
    );
  useEffect(() => {
    if (same) return;
    const key = "gmc-game-settings-applied";
    let applied = 0;
    try {
      applied = Number(localStorage.getItem(key)) || 0;
    } catch {
      /* stockage indisponible : on applique quand même */
    }
    if (applied >= updatedAt) return;
    void saveClubSettings(coaches, center)
      .then(() => {
        try {
          localStorage.setItem(key, String(updatedAt));
        } catch {
          /* rien à mémoriser */
        }
      })
      .catch(() => {
        /* réglages inchangés */
      });
  }, [same, coaches, center, updatedAt]);
  return (
    <small className="muted" style={{ display: "block", margin: "6px 0 0" }}>
      {same
        ? `Réglages lus dans le jeu le ${new Date(updatedAt).toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich" })} par GMC Companion.`
        : "Réglages modifiés ici : ils diffèrent de ceux lus dans le jeu."}
    </small>
  );
}
