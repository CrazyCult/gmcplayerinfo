"use client";

import { toast } from "sonner";
import type { Coach } from "@/engine/tables";
import { saveClubSettings, useClubSettings } from "@/lib/trainingSettings";

const LABELS: Record<Coach, string> = {
  att: "Offensif",
  mid: "Milieu",
  def: "Défensif",
  gk: "Gardiens",
  physio: "Physio",
};
const LEVELS = [1, 2, 3, 4, 5];

/** Niveaux des coachs et du centre, partagés avec le simulateur. */
export default function ClubSettingsForm() {
  const club = useClubSettings();
  const save = (coaches = club.coaches, center = club.center) =>
    void saveClubSettings(coaches, center).catch(() =>
      toast.error("Impossible de mémoriser les réglages."),
    );
  return (
    <div className="settings club-settings">
      {(Object.keys(LABELS) as Coach[]).map((coach) => (
        <label key={coach}>
          {LABELS[coach]}
          <select
            value={club.coaches[coach]}
            onChange={(event) =>
              save({ ...club.coaches, [coach]: Number(event.target.value) })
            }
          >
            {LEVELS.map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
      ))}
      <label>
        Centre
        <select
          value={club.center}
          onChange={(event) => save(club.coaches, Number(event.target.value))}
        >
          {LEVELS.map((level) => (
            <option key={level}>{level}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
